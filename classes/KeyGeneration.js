const EC = require("elliptic").ec;
const ec = new EC("secp256k1");
const tinysecp = require("tiny-secp256k1");
const { BIP32Factory } = require("bip32");
const bip39 = require("bip39");
const {
  encodeBech32,
  convertToBase32,
  convertFromBase32,
  decodeBech32,
} = require("../utils/bech32");
const Network = require("../utils/network");
const bip32 = BIP32Factory(tinysecp);

const SCAN_PATH = "m/352'/1'/0'/1'/0";

const SPEND_PATH = "m/352'/1'/0'/0'/0";

class SilentPaymentAddress {
  static get regex() {
    return /(^|\s)t?sp(rt)?1[0-9a-zA-Z]{113}($|\s)/;
  }

  constructor({ B_scan, B_spend, network = Network.Mainnet, version = 0 }) {
    this.B_scan = B_scan;
    this.B_spend = B_spend;
    this.network = network;
    this.version = version;
    this.hrp = this.network === Network.Testnet ? "tsp" : "sp";

    // Version validation
    if (this.version !== 0) {
      throw new Error("Can't have other version than 0 for now");
    }
  }

  /**
   * Returns silent address public keys
   * @param address The silent payment address
   * @returns Scan public key and Spend public key
   */

  static fromAddress(address) {
    const decoded = decodeBech32(address);
    const prefix = decoded[0];
    const words = decoded[1];

    if (prefix !== "sp" && prefix !== "sprt" && prefix !== "tsp") {
      throw new Error(`Invalid prefix: ${prefix}`);
    }

    const version = words[0];
    if (version !== 0) throw new Error("Invalid version");

    // Convert words to bytes (base32 to bytes)
    const key = convertFromBase32(words.slice(1));

    return new SilentPaymentAddress({
      B_scan: ec.keyFromPublic(key.slice(0, 33)).getPublic(),
      B_spend: ec.keyFromPublic(key.slice(33)).getPublic(),
      network: prefix === "tsp" ? Network.Testnet : Network.Mainnet,
      version: version,
    });
  }

  /**
   * Get silent payment address
   * @returns Silent payment address
   */

  toAddress() {
    return this.toString();
  }

  toString() {
    const encodedResult = encodeBech32(this.hrp, [
      this.version,
      ...convertToBase32([
        ...this.B_scan.encodeCompressed("array"),
        ...this.B_spend.encodeCompressed("array"),
      ]),
    ]);

    return encodedResult;
  }
}

class SilentPaymentDestination extends SilentPaymentAddress {
  constructor({ version, scanPubkey, spendPubkey, network, amount }) {
    super({
      version,
      B_scan: scanPubkey,
      B_spend: spendPubkey,
      network: network,
    });
    this.amount = amount;
  }

  static fromAddress(address, amount) {
    const receiver = SilentPaymentAddress.fromAddress(address);

    return new SilentPaymentDestination({
      scanPubkey: receiver.B_scan,
      spendPubkey: receiver.B_spend,
      network: receiver.network,
      version: receiver.version,
      amount: amount,
    });
  }
}

// Creating spending and scanning keys
class KeyGeneration extends SilentPaymentAddress {
  constructor({ version = 0, B_scan, B_spend, b_scan, b_spend, network }) {
    super({
      B_scan: B_scan,
      B_spend: B_spend,
      network: network,
      version: version,
    });
    this.b_scan = b_scan;
    this.b_spend = b_spend;
    this.B_scan = B_scan;
    this.B_spend = B_spend;
    this.network = network;
  }

  /**
   * Generate silent payment address through private keys
   * @param b_scan Scan private key
   * @param b_spend Spend private key
   * @returns
   */

  static fromPrivateKeys({
    b_scan,
    b_spend,
    network = Network.Mainnet,
    version = 0,
  }) {
    b_scan = b_scan.startsWith("0x") ? b_scan.slice(2) : b_scan;
    b_spend = b_spend.startsWith("0x") ? b_spend.slice(2) : b_spend;

    const B_scan = ec.keyFromPrivate(b_scan).getPublic();
    const B_spend = ec.keyFromPrivate(b_spend).getPublic();

    return new KeyGeneration({
      b_scan: ec.keyFromPrivate(b_scan).getPrivate(),
      b_spend: ec.keyFromPrivate(b_spend).getPrivate(),
      B_scan: B_scan,
      B_spend: B_spend,
      network: network,
      version: version,
    });
  }

  /**
   * Generate silent payment address through HD keys
   * @param bip32 HD wallet. We have provided an easy way to access bip32
   * @param hrp 'sp' for mainnet, tsp for testnet
   * @returns
   */

  static fromHd(bip32, { hrp = "sp", version = 0 } = {}) {
    const scanDerivation = bip32.derivePath(SCAN_PATH);
    const spendDerivation = bip32.derivePath(SPEND_PATH);
    return new KeyGeneration({
      b_scan: ec.keyFromPrivate(scanDerivation.privateKey).getPrivate(),
      b_spend: ec.keyFromPrivate(spendDerivation.privateKey).getPrivate(),
      B_scan: ec.keyFromPrivate(scanDerivation.privateKey).getPublic(),
      B_spend: ec.keyFromPrivate(spendDerivation.privateKey).getPublic(),
      network: hrp == "tsp" ? Network.Testnet : Network.Mainnet,
      version: version,
    });
  }

  /**
   * Generate silent payment address through mnemonic
   * @param mnemonic Mnemonic phrase.
   * @param hrp 'sp' for mainnet, tsp for testnet
   * @returns
   */

  static fromMnemonic(mnemonic, { hrp = "sp", version = 0 } = {}) {
    return KeyGeneration.fromHd(
      bip32.fromSeed(bip39.mnemonicToSeedSync(mnemonic)),
      {
        hrp: hrp,
        version: version,
      }
    );
  }
}

module.exports = { KeyGeneration, SilentPaymentDestination };
