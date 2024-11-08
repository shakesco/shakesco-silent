# @shakesco/silent

_special credit to [Ruben Somsen](https://x.com/SomsenRuben) and [Josi Bake](https://x.com/josibake)_

## Install

To get started, install the package with your package manager.

```shell {filename=cmd}
npm i @shakesco/silent
```

After installing:

```js {filename="index.js"}
const shakesco = require("@shakesco/silent");
const {
  KeyGeneration,
  SilentPaymentDestination,
  SilentPaymentBuilder,
  ECPrivateInfo,
  Network,
  BitcoinScriptOutput,
  bip32,
  bip39
} = shakesco;
```

### Generate Silent Payment address

This will generate the silent payment address. It prepares a receiver to receive silent payments.
You can generate a silent payment address in three ways:

##### Private Keys

If you are not a wallet provider, use this method. More specifically, you can make the user sign a message and then derive `b_scan` and `b_spend` from the resulting [signature](https://cryptobook.nakov.com/digital-signatures/ecdsa-sign-verify-messages#ecdsa-sign) (Use `r` as `b_scan` and `s` as `b_spend` or vice versa).

>⚠️ If you are not using this method, ensure that a cryptographically secure random number generator is being used.

```js {filename="index.js"}
function main() {
    const b_scan = "";
    const b_spend = "";
    const keys = KeyGeneration.fromPrivateKeys({
    b_scan: b_scan,
    b_spend: b_spend,
    network: "testnet",
    });
    const silentPaymentAddress = keys.toAddress();
    console.log(silentPaymentAddress); // Silent payment address
}
```

##### Mnemonic and HD Key

If you are a wallet provider, use this method.

```js {filename="index.js"}
function main() {
  const mnemonic = ""; // 12, 15, 24 word phrase
  const keys = KeyGeneration.fromMnemonic(mnemonic);
  const silentPaymentAddress = keys.toAddress();
  console.log(silentPaymentAddress);

// const seed = bip39.mnemonicToSeedSync(mnemonic);
// const node = bip32.fromSeed(seed);
// const keys = KeyGeneration.fromHd(node);
// const silentPaymentAddress = keys.toAddress();
// console.log(silentPaymentAddress);
}
```

#### Create a change address

Create a change silent payment address that won't break privacy. Consider a scenario where you have sent 10 silent payments to friends and have sent the change to your public address. In this case, you would have compromised not only your private transactions but also those of your friends. So, let's create a change address:

```js {filename="index.js"}
function main() {
    const b_scan = "";
    const b_spend = "";
    const keys = KeyGeneration.fromPrivateKeys({
    b_scan: b_scan,
    b_spend: b_spend,
    network: "testnet",
    });
    const changeSilentPaymentAddress = keys.toLabeledSilentPaymentAddress(0); //should always be zero!(https://github.com/bitcoin/bips/blob/master/bip-0352.mediawiki#labels_for_change)
    console.log(changeSilentPaymentAddress.toAddress()); // change silent payment address
}
```

### Create a taproot address destination

Here is where you create a destination address for the user to send to a newly generated Taproot address, derived from the receiver's silent payment address generated above.
You will need:

1. The Unspent Transaction Output(UTXO) of the user, hash and output_index.
2. The private key of the UTXO in 1 above.
3. Amount the user wants to send. Should be in satoshis(1 BTC = 100<sup>6</sup> satoshis)
4. Finally, the public keys of the 2 secret shares, `B_scan` and `B_spend`

```js {filename="index.js"}
function main() {
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
    [
        new ECPrivateInfo(
        UTXOPrivatekey,
        false // If the output is from a taproot address
        ),
    ],
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
    console.log(builder[silentPaymentAddress][0]); // Access the taproot address and send 1000 satoshis
}
```

### Scan for funds

Scanning for funds is a drawback of silent payments. So below is how you can check if a certain transaction belongs to a user. You will need:

1. The transaction input's tx_hash and output_index.
2. Public key outputted.
3. Script and amount from the outputted taproot address

For more info, go [here](https://github.com/bitcoin/bips/blob/master/bip-0352.mediawiki#scanning-silent-payment-eligible-transactions)

```js {filename="index.js"}
function main() {
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

    console.log(
    search[builder[keys.toAddress()][0].address.pubkey.toString("hex")].output
    );
}
```

If the address above matches the taproot address from the output in the transaction, it belongs to the user.

### Spend funds

If the funds belong to the user, they can spend like so:

First, you will need:

1. The transaction input's tx_hash and output_index.
2. Public key outputted.
3. Receiver's spend and scan private keys.

```js {filename="index.js"}
function main() {
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

    console.log(private_key); // use this to build a taproot transaction with bitcoinjs: https://github.com/bitcoinjs/bitcoinjs-lib
}
```

The receiver can use `private_key` to spend the funds!

Thats it! 🎊🎊🎊

### Contribute

If you love what we do to progress privacy, [contribute](https://me-qr.com/text/vPod5qN0 "btc_addr") to further development

<img src="./images/bitcoin.png" alt="btc_addr" style="display: inline-block; margin-right: 100px; margin-left: 70px;" width="200">
<img src="./images/silent.png" alt="silent_addr" width="200" style="display: inline-block; margin-right: 10px;">
