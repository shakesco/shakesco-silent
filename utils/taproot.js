const elliptic = require("elliptic");
const ec = new elliptic.ec("secp256k1");
const BN = require("bn.js");
const { createHash } = require("crypto");
const { convertToBase32, encodeBech32 } = require("./bech32");
const { TAPROOT_WITNESS_VERSION } = require("./const");
const Network = require("./network");

class P2trAddress {
  constructor(address, pubkey) {
    this.address = address;
    this.pubkey = pubkey;
  }

  static saveTaproot({ address, pubkey }) {
    return new P2trAddress(address, pubkey);
  }
}

function toTaprootAddress(
  publicKey,
  network = Network.Mainnet,
  { scripts = null, tweak = true } = {}
) {
  const pubKey = toTapRotHex(publicKey, { script: scripts, tweak });
  const words = convertToBase32(Buffer.from(pubKey, "hex"));
  words.unshift(TAPROOT_WITNESS_VERSION);

  const hrp = network == Network.Testnet ? "tb" : "bc";
  return P2trAddress.saveTaproot({
    address: encodeBech32(hrp, words),
    pubkey: Buffer.from(pubKey, "hex"),
  });
}

function toTapRotHex(pubKey, { script = null, tweak = true }) {
  let point = ec.keyFromPublic(pubKey, "hex").getPublic();

  if (tweak) {
    const scriptBytes = script?.map((e) => e.map((e) => Buffer.from(e, "hex")));
    point = P2TRUtils.tweakPublicKey(point, { script: scriptBytes });
  }

  return point.getX().toString("hex").padStart(64, "0");
}

class P2TRUtils {
  static tweakPublicKey(pubPoint, { script = null }) {
    const h = this.calculateTweak(pubPoint, { script });
    const n = ec.g.mul(new BN(h, 16));
    const outPoint = this.liftX(pubPoint).add(n);

    return outPoint;
  }

  static liftX(pubKeyPoint) {
    const p = ec.curve.p; // Prime for the secp256k1 curve
    const x = pubKeyPoint.x;

    // Check if x is valid
    if (x.cmp(p) >= 0) {
      throw new Error("Unable to compute LiftX point");
    }

    // Compute y^2 = (x^3 + 7) % p
    const ySq = x.pow(new BN(3)).mod(p).add(new BN(7)).mod(p);

    // Compute y = ySq ^ ((p + 1) / 4) % p
    const y = ySq.pow(p.add(new BN(1)).div(new BN(4))).mod(p);

    // Check if y^2 == ySq (i.e., the point is on the curve)
    if (y.pow(new BN(2)).mod(p).cmp(ySq) !== 0) {
      throw new Error("Unable to compute LiftX point");
    }

    // Ensure y is the correct parity (even or odd)
    const result = y.isEven() ? y : p.sub(y);

    // Return the new point on the curve
    return ec.curve.point(x, result);
  }

  static calculateTweak(pubPoint, { script = null }) {
    const x = pubPoint.getX().toString("hex").padStart(64, "0");
    let t = Buffer.from(x, "hex");

    if (script) {
      const h = createHash("sha256");
      h.update(t);
      for (const leaf of script) {
        h.update(Buffer.concat(leaf));
      }
      t = h.digest();
    }

    return t.toString("hex");
  }
}

module.exports = {
  toTaprootAddress,
};
