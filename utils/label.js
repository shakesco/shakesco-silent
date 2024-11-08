const crypto = require("crypto");
const EC = require("elliptic").ec;
const ec = new EC("secp256k1");
const BN = require("bn.js");

function privateKeyToBytes(privateKey) {
  // Convert to hex string padded to 64 characters (32 bytes)
  const hexString = privateKey.toString("hex").padStart(64, "0");

  // Convert hex string to Uint8Array
  return new Uint8Array(Buffer.from(hexString, "hex"));
}

function generateLabel(m, b_scan) {
  return taggedHash(
    concatBytes([privateKeyToBytes(b_scan), serUint32(m)]),
    "BIP0352/Label"
  );
}

function tweakAdd(publicKey, tweak) {
  // Convert tweak to BN (Big Number) format
  const tweakBN =
    typeof tweak === "bigint" ? new BN(tweak.toString(16), 16) : new BN(tweak);

  // Multiply generator point by tweak
  const tweakMul = ec.g.mul(tweakBN);

  // Add the original point and the tweaked generator point
  return publicKey.add(tweakMul);
}

function serUint32(n) {
  return toBytes(BigInt(n), 4);
}

function toBytes(val, length, order = "big") {
  if (val === BigInt(0)) {
    return new Array(length).fill(0);
  }

  const bigMaskEight = BigInt(0xff);

  const byteList = new Array(length).fill(0);

  for (let i = 0; i < length; i++) {
    byteList[length - i - 1] = Number(val & bigMaskEight);
    val = val >> BigInt(8);
  }

  if (order === "little") {
    return byteList.reverse();
  }

  return byteList;
}

function taggedHash(data, tag) {
  const tagHash = sha256Hash(new TextEncoder().encode(tag));
  const concat = concatBytes([tagHash, tagHash, data]);
  return sha256Hash(concat);
}

function sha256Hash(data) {
  return crypto.createHash("sha256").update(data).digest();
}

function concatBytes(lists) {
  // First make sure we're dealing with an array
  if (!Array.isArray(lists)) {
    throw new Error("Input must be an array of arrays");
  }

  // Filter out any undefined/null values first
  const validLists = lists.filter((list) => list != null);

  // Calculate total length
  let totalLength = 0;
  for (const list of validLists) {
    totalLength += list.length;
  }

  // Create result array filled with zeros
  const result = new Uint8Array(totalLength);

  // Copy data
  let offset = 0;
  for (const list of validLists) {
    result.set(list, offset);
    offset += list.length;
  }

  return result;
}

module.exports = {
  generateLabel,
  tweakAdd,
};
