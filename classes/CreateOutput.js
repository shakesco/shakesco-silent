const elliptic = require("elliptic");
const ec = new elliptic.ec("secp256k1");
const BN = require("bn.js");
const { toTaprootAddress } = require("../utils/taproot");
const {
  toBytes,
  taggedHash,
  toTweakedTaprootKey,
  negate,
  tweakAddPrivate,
  tweakMulPrivate,
  tweakMulPublic,
  tweakAddPublic,
  pubNegate,
} = require("../utils/utils");
const SilentPaymentScanningOutput = require("../utils/output");

/**
 * This class helps you create a destination taproot address, scan and spend
 * silent payment.
 */

class SilentPaymentBuilder {
  constructor({ vinOutpoints, pubkeys, network = "mainnet", receiverTweak }) {
    this.vinOutpoints = vinOutpoints;
    this.pubkeys = pubkeys;
    this.receiverTweak = receiverTweak;
    this.network = network;
    this.A_sum = null;
    this.inputHash = null;

    if (receiverTweak == null && pubkeys != null) {
      this._getAsum();
      this._getInputHash();
    }
  }

  _getAsum() {
    const head = this.pubkeys[0];
    const tail = this.pubkeys.slice(1);

    this.A_sum = tail.reduce((acc, item) => {
      const accPoint = ec.keyFromPublic(acc, "hex").getPublic();
      const itemPoint = ec.keyFromPublic(item, "hex").getPublic();
      return accPoint.add(itemPoint).encode("hex", true);
    }, head);
  }

  _getInputHash() {
    const sortedOutpoints = this.vinOutpoints.map((outpoint) => {
      const txidBuffer = Buffer.from(outpoint.txid, "hex").reverse();
      const indexBuffer = Buffer.alloc(4);
      indexBuffer.writeUInt32LE(outpoint.index);
      return Buffer.concat([txidBuffer, indexBuffer]);
    });

    sortedOutpoints.sort(Buffer.compare);
    const lowestOutpoint = sortedOutpoints[0];

    const A_sumBuffer = Buffer.from(this.A_sum, "hex");
    this.inputHash = taggedHash(
      Buffer.concat([lowestOutpoint, A_sumBuffer]),
      "BIP0352/Inputs"
    );
  }

  /**
   * Create a destination taproot address for each silent payment address
   * @param inputPrivKeyInfos Private key for each transaction output. Use ECPrivateInfo
   * @param silentPaymentDestinations Destination of the silent payment. Use SilentPaymentDestination
   * @returns Object pointing each silent payment address to the destination taproot address
   */

  createOutputs(inputPrivKeyInfos, silentPaymentDestinations) {
    let a_sum = null;
    let network;

    for (const info of inputPrivKeyInfos) {
      let k = ec.keyFromPrivate(info.privkey);
      const isTaproot = info.isTaproot;

      if (isTaproot) {
        if (info.tweak) {
          k = toTweakedTaprootKey(k);
        }

        const xOnlyPubkey = k.getPublic();
        const isOdd = xOnlyPubkey.getY().isOdd();

        if (isOdd) {
          k = negate(k);
        }
      }

      if (a_sum === null) {
        a_sum = k;
      } else {
        a_sum = tweakAddPrivate(a_sum, k.getPrivate());
      }
    }

    this.A_sum = a_sum.getPublic().encode("hex", true);
    this._getInputHash();

    const silentPaymentGroups = {};

    for (const silentPaymentDestination of silentPaymentDestinations) {
      const B_scan = silentPaymentDestination.B_scan;
      network = silentPaymentDestination.network;
      const scanPubkey = B_scan;

      if (silentPaymentGroups[scanPubkey]) {
        const group = silentPaymentGroups[scanPubkey];
        const ecdhSharedSecret = Object.keys(group)[0];
        const recipients = group[ecdhSharedSecret];

        silentPaymentGroups[scanPubkey] = {
          [ecdhSharedSecret]: [...recipients, silentPaymentDestination],
        };
      } else {
        const senderPartialSecret = tweakMulPrivate(
          a_sum,
          new BN(this.inputHash)
        );
        const ecdhSharedSecret = tweakMulPublic(
          ec.keyFromPublic(B_scan, "hex").getPublic(),
          senderPartialSecret.getPrivate()
        ).encode("hex", true);

        silentPaymentGroups[scanPubkey] = {
          [ecdhSharedSecret]: [silentPaymentDestination],
        };
      }
    }

    const result = {};

    for (const [scanPubkey, group] of Object.entries(silentPaymentGroups)) {
      const ecdhSharedSecret = Object.keys(group)[0];
      const destinations = group[ecdhSharedSecret];

      let k = 0;
      for (const destination of destinations) {
        const t_k = taggedHash(
          Buffer.concat([
            Buffer.from(
              ec
                .keyFromPublic(Buffer.from(ecdhSharedSecret, "hex"))
                .getPublic()
                .encodeCompressed(),
              "array"
            ),
            Buffer.from(toBytes(BigInt(k), 4), "array"),
          ]),
          "BIP0352/SharedSecret"
        );

        const P_mn = tweakAddPublic(
          ec.keyFromPublic(destination.B_spend, "hex").getPublic(),
          new BN(t_k)
        );

        const resOutput = {
          address: toTaprootAddress(P_mn, network, { tweak: false }),
          amount: destination.amount,
        };

        if (result[destination.toString()]) {
          result[destination.toString()].push(resOutput);
        } else {
          result[destination.toString()] = [resOutput];
        }

        k++;
      }
    }

    return result;
  }

  /**
   * Scan every transaction on the network to find users silent payments
   * Check here to see valid checks: https://github.com/bitcoin/bips/blob/master/bip-0352.mediawiki#scanning-silent-payment-eligible-transactions
   * @param b_scan Scan private key.
   * @param B_spend Spend Public key
   * @param outputsToCheck Script and amount to check. Use BitcoinScriptOutput
   * @param precomputedLabels Optional labels to differentiate silent payments if already precomputed.
   * @returns Silent payment address and the amount
   */

  scanOutputs(b_scan, B_spend, outputsToCheck, precomputedLabels = {}) {
    const tweakDataForRecipient = this.receiverTweak
      ? ec.keyFromPublic(this.receiverTweak).getPublic()
      : tweakMulPublic(
          ec.keyFromPublic(Buffer.from(this.A_sum, "hex")).getPublic(),
          this.inputHash
        );
    const ecdhSharedSecret = tweakMulPublic(tweakDataForRecipient, b_scan);

    const matches = {};
    var k = 0;

    do {
      const t_k = taggedHash(
        Buffer.concat([
          Buffer.from(ecdhSharedSecret.encodeCompressed(), "array"),
          Buffer.from(toBytes(BigInt(k), 4), "array"),
        ]),
        "BIP0352/SharedSecret"
      );

      const P_k = tweakAddPublic(B_spend, t_k);
      const length = outputsToCheck.length;

      for (var i = 0; i < length; i++) {
        const output = outputsToCheck[i].script.slice(4);
        const outputPubkey = output.toString("hex");
        const outputAmount = Number(outputsToCheck[i].value);

        if (
          Buffer.compare(
            Buffer.from(output, "hex"),
            Buffer.from(P_k.encodeCompressed().slice(1), "array")
          ) === 0
        ) {
          matches[outputPubkey] = new SilentPaymentScanningOutput({
            output: new SilentPaymentOutput(
              toTaprootAddress(P_k, this.network, {
                tweak: false,
              }),
              outputAmount
            ),
            tweak: t_k.toString("hex"),
          });

          outputsToCheck.splice(i, 1);
          k++;
          break;
        }

        if (precomputedLabels != null && precomputedLabels.isNotEmpty) {
          var m_G_sub = tweakAddPublic(
            ec.keyFromPublic(Buffer.from(output, "hex")).getPublic(),
            pubNegate(P_k)
          );
          var m_G =
            precomputedLabels[
              ec.keyFromPublic(m_G_sub).getPublic().encodeCompressed("hex")
            ];

          if (!m_G) {
            m_G_sub = ec
              .keyFromPublic(Buffer.from(output, "hex"))
              .getPublic()
              .add(pubNegate(P_k));
            m_G =
              precomputedLabels[
                ec.keyFromPublic(m_G_sub).getPublic().encodeCompressed("hex")
              ];
          }

          if (m_G) {
            const P_km = tweakAddPublic(P_k, m_G);

            matches[outputPubkey] = new SilentPaymentScanningOutput({
              output: new SilentPaymentOutput(
                toTaprootAddress(P_km, this.network, {
                  tweak: false,
                }),
                outputAmount
              ),
              tweak: tweakAddPrivate(ec.keyFromPrivate(t_k).getPrivate(), m_G)
                .getPrivate()
                .toString("hex"),
              label: m_G,
            });

            outputsToCheck.splice(i, 1);
            k++;
            break;
          }
        }

        outputsToCheck.splice(i, 1);

        if (i + 1 >= outputsToCheck.length) {
          break;
        }
      }
    } while (outputsToCheck.isNotEmpty);

    return matches;
  }

  /**
   * Spend the silent payment
   * @param b_scan Scan private key
   * @param b_spend Spend private Key
   * @returns
   */

  spendOutputs(b_scan, b_spend) {
    let tweakScalar;

    if (this.receiverTweak) {
      // The tweak is already the t_k scalar value, use it directly as BigInt
      tweakScalar = new BN(Buffer.from(this.receiverTweak, "hex"));
    } else {
      // Calculate the tweak from inputs
      const tweakDataForRecipient = tweakMulPublic(
        ec.keyFromPublic(Buffer.from(this.A_sum, "hex")).getPublic(),
        this.inputHash
      );

      const ecdhSharedSecret = tweakMulPublic(tweakDataForRecipient, b_scan);

      var k = 0;

      const t_k = taggedHash(
        Buffer.concat([
          Buffer.from(ecdhSharedSecret.encodeCompressed(), "array"),
          Buffer.from(toBytes(BigInt(k), 4), "array"),
        ]),
        "BIP0352/SharedSecret"
      );

      tweakScalar = new BN(t_k);
    }

    // Apply the tweak to get the private key
    const p_k = tweakAddPrivate(
      ec.keyFromPrivate(b_spend.toString("hex")),
      tweakScalar
    );

    return p_k.getPrivate().toString("hex");
  }
}

class SilentPaymentOutput {
  constructor(address, value) {
    this.address = address;
    this.value = value;
  }
}

module.exports = SilentPaymentBuilder;
