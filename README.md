# @shakesco/silent

_Special credit to [Ruben Somsen](https://x.com/SomsenRuben) and [Josie Bake](https://x.com/josibake)_

JavaScript SDK for Bitcoin silent payments (BIP-352). Share a single reusable address for receiving Bitcoin privately.

**📚 Full documentation:** [docs.shakesco.com/silent-payments](https://docs.shakesco.com/silent-payments/)

## Install

```bash
npm i @shakesco/silent
```

`

## Usage

```javascript
const shakesco = require("@shakesco/silent");
const {
  KeyGeneration,
  SilentPaymentDestination,
  SilentPaymentBuilder,
  ECPrivateInfo,
  Network,
  BitcoinScriptOutput,
  bip32,
  bip39,
} = shakesco;
```

## Quick Start

### 1. Generate Silent Payment Address

**From Private Keys (Recommended):**

```javascript
const b_scan = "";
const b_spend = "";
const keys = KeyGeneration.fromPrivateKeys({
  b_scan: b_scan,
  b_spend: b_spend,
  network: "testnet",
});

const silentPaymentAddress = keys.toAddress();
console.log(silentPaymentAddress);
```

> 💡 **Tip:** Derive `b_scan` and `b_spend` from user's [ECDSA signature](https://cryptobook.nakov.com/digital-signatures/ecdsa-sign-verify-messages#ecdsa-sign) (use `r` and `s` values).

**From Mnemonic:**

```javascript
const mnemonic = ""; // 12, 15, or 24 words
const keys = KeyGeneration.fromMnemonic(mnemonic);
const silentPaymentAddress = keys.toAddress();
```

**Create Change Address:**

```javascript
const changeSilentPaymentAddress = keys.toLabeledSilentPaymentAddress(0);
console.log(changeSilentPaymentAddress.toAddress());
```

### 2. Create Destination Address

```javascript
const addressPubKeys = KeyGeneration.fromAddress(silentPaymentAddress);

const vinOutpoints = [
  {
    txid: "367e24cac43a7d77621ceb1cbc1cf4a7719fc81b05b07b38f99b043f4e8b95dc",
    index: 1,
  },
];

const pubkeys = [
  "025c471f0e7d30d6f9095058bbaedaf13e1de67dbfcbe8328e6378d2a3bfb5cfd0",
];
const UTXOPrivatekey = "";

const builder = new SilentPaymentBuilder({
  vinOutpoints: vinOutpoints,
  pubkeys: pubkeys,
}).createOutputs(
  [new ECPrivateInfo(UTXOPrivatekey, false)],
  [
    new SilentPaymentDestination({
      amount: 1000,
      network: Network.Testnet,
      version: 0,
      scanPubkey: addressPubKeys.B_scan,
      spendPubkey: addressPubKeys.B_spend,
    }),
  ]
);

console.log(builder[silentPaymentAddress][0]); // Send sats here
```

### 3. Scan for Incoming Funds

```javascript
const vinOutpoints = [
  {
    txid: "367e24cac43a7d77621ceb1cbc1cf4a7719fc81b05b07b38f99b043f4e8b95dc",
    index: 1,
  },
];

const pubkeys = [
  "025c471f0e7d30d6f9095058bbaedaf13e1de67dbfcbe8328e6378d2a3bfb5cfd0",
];

const search = new SilentPaymentBuilder({
  vinOutpoints: vinOutpoints,
  pubkeys: pubkeys,
  network: Network.Testnet,
}).scanOutputs(keys.b_scan, keys.B_spend, [
  new BitcoinScriptOutput(
    "5120fdcb28bcea339a5d36d0c00a3e110b837bf1151be9e7ac9a8544e18b2f63307d",
    BigInt(1000)
  ),
]);

console.log(search); // Check if payment is yours
```

### 4. Spend the Funds

```javascript
const vinOutpoints = [
  {
    txid: "367e24cac43a7d77621ceb1cbc1cf4a7719fc81b05b07b38f99b043f4e8b95dc",
    index: 1,
  },
];

const pubkeys = [
  "025c471f0e7d30d6f9095058bbaedaf13e1de67dbfcbe8328e6378d2a3bfb5cfd0",
];

const private_key = new SilentPaymentBuilder({
  vinOutpoints: vinOutpoints,
  pubkeys: pubkeys,
}).spendOutputs(keys.b_scan, keys.b_spend);

console.log(private_key); // Use with bitcoinjs-lib
```

That's it! Use the private key with [bitcoinjs-lib](https://github.com/bitcoinjs/bitcoinjs-lib) to build your transaction.

## Resources

- [BIP-352 Specification](https://github.com/bitcoin/bips/blob/master/bip-0352.mediawiki)
- [Silent Payments Explained](https://silentpayments.xyz/docs/explained/)
- [bitcoinjs-lib](https://github.com/bitcoinjs/bitcoinjs-lib)
