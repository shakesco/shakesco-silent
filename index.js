const {
  KeyGeneration,
  SilentPaymentDestination,
} = require("./classes/KeyGeneration");
const SilentPaymentBuilder = require("./classes/CreateOutput");
const ECPrivateInfo = require("./utils/info");
const Network = require("./utils/network");
const BitcoinScriptOutput = require("./utils/scriptOutput");
const { BIP32Factory } = require("bip32");
const tinysecp = require("tiny-secp256k1");
const bip32 = BIP32Factory(tinysecp);
const bip39 = require("bip39");

module.exports = {
  KeyGeneration,
  SilentPaymentDestination,
  SilentPaymentBuilder,
  ECPrivateInfo,
  Network,
  BitcoinScriptOutput,
  bip32,
  bip39,
};
