# @shakesco/silent

JavaScript SDK for receiving Bitcoin privately with silent payments (BIP-352).

> Special thanks to [Ruben Somsen](https://x.com/SomsenRuben) and [Josie Bake](https://x.com/josibake) for their groundbreaking work on BIP-352.

## What It Does

The `@shakesco/silent` SDK lets you implement Bitcoin silent payments, allowing users to:

- ✅ Share a single address for all payments
- ✅ Receive Bitcoin privately
- ✅ Maintain transaction unlinkability
- ✅ Avoid notification transaction fees

**Learn more:**

- [BIP-352 Specification](https://github.com/bitcoin/bips/blob/master/bip-0352.mediawiki)
- [Silent Payments Explained](https://silentpayments.xyz/docs/explained/)
- [Full documentation](https://docs.shakesco.com/silent-payments/)

## Installation

```bash
npm i @shakesco/silent
```

## Quick Start

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

## Integration Workflow

1. Generate silent payment address
2. Create destination address for each payment
3. Scan for incoming funds
4. Spend received funds

---

## 1. Generate Silent Payment Address

### From Private Keys (Recommended for Apps)

**Best for:** Non-wallet applications where users control their keys

```javascript
const b_scan = ""; // Scan private key
const b_spend = ""; // Spend private key

const keys = KeyGeneration.fromPrivateKeys({
  b_scan: b_scan,
  b_spend: b_spend,
  network: "testnet",
});

const silentPaymentAddress = keys.toAddress();
console.log(silentPaymentAddress);
```

**Pro tip:** Make users sign a message, then derive `b_scan` and `b_spend` from the [ECDSA signature](https://cryptobook.nakov.com/digital-signatures/ecdsa-sign-verify-messages#ecdsa-sign):

- Use `r` as `b_scan`
- Use `s` as `b_spend` (or vice versa)

This ensures cryptographically secure randomness without storing additional keys.

### From Mnemonic (For Wallets)

**Best for:** Wallet providers managing user funds

```javascript
const mnemonic = ""; // 12, 15, or 24 word phrase
const keys = KeyGeneration.fromMnemonic(mnemonic);
const silentPaymentAddress = keys.toAddress();
console.log(silentPaymentAddress);
```

**Alternative using HD key:**

```javascript
const seed = bip39.mnemonicToSeedSync(mnemonic);
const node = bip32.fromSeed(seed);
const keys = KeyGeneration.fromHd(node);
const silentPaymentAddress = keys.toAddress();
```

**Security Note:** If not using the signature-derived method, ensure you're using a cryptographically secure random number generator.

### Create a Change Address

**Critical for privacy:** Never send change to a public address after making silent payments.

```javascript
const keys = KeyGeneration.fromPrivateKeys({
  b_scan: b_scan,
  b_spend: b_spend,
  network: "testnet",
});

// Always use label 0 for change (per BIP-352 spec)
const changeSilentPaymentAddress = keys.toLabeledSilentPaymentAddress(0);
console.log(changeSilentPaymentAddress.toAddress());
```

**Why this matters:** If you send 10 silent payments to friends, then send change to your public address, you've exposed:

- ❌ Your own private transaction history
- ❌ Your friends' payment patterns
- ❌ Links between all 10 transactions

**Solution:** Always use a labeled silent payment address for change.

Reference: [BIP-352 Labels for Change](https://github.com/bitcoin/bips/blob/master/bip-0352.mediawiki#labels_for_change)

---

## 2. Create Destination Address

Generate a unique taproot address for the payment:

```javascript
// Parse recipient's silent payment address
const addressPubKeys = KeyGeneration.fromAddress(silentPaymentAddress);

// Your UTXO details
const vinOutpoints = [
  {
    txid: "367e24cac43a7d77621ceb1cbc1cf4a7719fc81b05b07b38f99b043f4e8b95dc",
    index: 1,
  },
];

const pubkeys = [
  "025c471f0e7d30d6f9095058bbaedaf13e1de67dbfcbe8328e6378d2a3bfb5cfd0",
];

const UTXOPrivatekey = ""; // Your UTXO private key

// Build the destination
const builder = new SilentPaymentBuilder({
  vinOutpoints: vinOutpoints,
  pubkeys: pubkeys,
}).createOutputs(
  [
    new ECPrivateInfo(
      UTXOPrivatekey,
      false // Set true if output is from taproot
    ),
  ],
  [
    new SilentPaymentDestination({
      amount: 1000, // Satoshis (1 BTC = 100,000,000 sats)
      network: Network.Testnet,
      version: 0,
      scanPubkey: addressPubKeys.B_scan,
      spendPubkey: addressPubKeys.B_spend,
    }),
  ]
);

// Get the destination taproot address
const destinationAddress = builder[silentPaymentAddress][0];
console.log("Send 1000 sats to:", destinationAddress);
```

**What you need:**

- UTXO transaction ID and output index
- UTXO private key
- Amount in satoshis
- Recipient's scan and spend public keys (`B_scan`, `B_spend`)

---

## 3. Scan for Incoming Funds

**Trade-off:** This is the main drawback of silent payments - you must scan the blockchain to detect incoming transactions.

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
}).scanOutputs(
  keys.b_scan, // Your scan private key
  keys.B_spend, // Your spend public key
  [
    new BitcoinScriptOutput(
      "5120fdcb28bcea339a5d36d0c00a3e110b837bf1151be9e7ac9a8544e18b2f63307d",
      BigInt(1000)
    ),
  ]
);

const foundOutput =
  search[builder[keys.toAddress()][0].address.pubkey.toString("hex")].output;
console.log(foundOutput);
```

If the output matches the taproot address → it's yours! 🎉

**What you need for scanning:**

- Transaction input's `txid` and `output_index`
- Public key from the output
- Script and amount from the taproot address

Learn more: [BIP-352 Scanning](https://github.com/bitcoin/bips/blob/master/bip-0352.mediawiki#scanning-silent-payment-eligible-transactions)

---

## 4. Spend the Funds

Once you've confirmed funds belong to you, derive the private key:

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

console.log("Private key:", private_key);
```

**Tip:** Use this private key with [bitcoinjs-lib](https://github.com/bitcoinjs/bitcoinjs-lib) to build and sign your taproot transaction.

---

## That's It!

You've successfully implemented Bitcoin silent payments. Your users can now receive Bitcoin privately without address reuse.

## Documentation

For complete integration guides and examples, visit: [docs.shakesco.com/silent-payments](https://docs.shakesco.com/silent-payments/)

## Resources

- [BIP-352 Specification](https://github.com/bitcoin/bips/blob/master/bip-0352.mediawiki) - Complete technical specification
- [bitcoinjs-lib](https://github.com/bitcoinjs/bitcoinjs-lib) - Build Bitcoin transactions in JavaScript
- [Silent Payments Explained](https://silentpayments.xyz/docs/explained/) - Protocol deep dive
- [ECDSA Signatures](https://cryptobook.nakov.com/digital-signatures/ecdsa-sign-verify-messages) - Learn about signature-based key derivation
