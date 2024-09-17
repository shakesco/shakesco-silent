const elliptic = require("elliptic");
const ec = new elliptic.ec("secp256k1");
const BN = require("bn.js");
const { createHash } = require("crypto");

function toBytes(bigInt, length = 4) {
  let hex = bigInt.toString(16);
  if (hex.length % 2) {
    hex = "0" + hex; // Ensure the hex string has even length
  }
  const bytes = [];
  for (let i = 0; i < hex.length; i += 2) {
    bytes.push(parseInt(hex.substr(i, 2), 16));
  }

  // Ensure the byte array has the required length by padding with leading zeros
  while (bytes.length < length) {
    bytes.unshift(0);
  }
  return bytes.slice(-length); // Ensure it's exactly 'length' bytes
}

function tweakAddPrivate(key, tweak) {
  const privateKey = key.getPrivate().add(tweak).umod(ec.curve.n);
  return ec.keyFromPrivate(privateKey);
}

function tweakMulPrivate(key, tweak) {
  const privateKey = key.getPrivate().mul(tweak).umod(ec.curve.n);
  return ec.keyFromPrivate(privateKey);
}

function tweakAddPublic(key, tweak) {
  return key.add(ec.g.mul(tweak));
}

function tweakMulPublic(key, tweak) {
  return key.mul(tweak);
}

function negate(key) {
  const negatedPrivate = ec.curve.n.sub(key.getPrivate());
  return ec.keyFromPrivate(negatedPrivate);
}

function pubNegate(key) {
  // Get the current point
  const point = key;

  // Negate the Y-coordinate
  const negatedPoint = point.neg();

  // Convert the negated point to uncompressed format (04 || x || y)
  const xHex = negatedPoint.getX().toString("hex").padStart(64, "0");
  const yHex = negatedPoint.getY().toString("hex").padStart(64, "0");
  const uncompressedHex = "04" + xHex + yHex;

  // Create and return a new ECPublic instance
  return ec.keyFromPublic(uncompressedHex, "hex");
}

function toTweakedTaprootKey(key) {
  const pubKey = key.getPublic();
  const t = calculateTweek(pubKey);
  return calculatePrivateTweek(key.getPrivate(), new BN(t));
}

function calculateTweek(pubPoint, script = null) {
  const keyX = pubPoint.getX().toArrayLike(Buffer, "be", 32);
  if (script === null) {
    return this.taggedHash("TapTweak", keyX);
  }
  const merkleRoot = this._getTagHashedMerkleRoot(script);
  return this.taggedHash("TapTweak", Buffer.concat([keyX, merkleRoot]));
}

function taggedHash(tag, dataBytes) {
  if (typeof tag !== "string" && !Buffer.isBuffer(tag)) {
    throw new Error("tag must be string or Buffer");
  }
  const tagHash = typeof tag === "string" ? this.sha256(Buffer.from(tag)) : tag;
  return this.sha256(Buffer.concat([tagHash, tagHash, dataBytes]));
}

function _getTagHashedMerkleRoot(args) {
  if (Buffer.isBuffer(args)) {
    return this._tapleafTaggedHash(args);
  }

  if (!Array.isArray(args)) throw new Error("args must be Buffer or Array");
  if (args.length === 0) return Buffer.alloc(0);
  if (args.length === 1) {
    return this._getTagHashedMerkleRoot(args[0]);
  } else if (args.length === 2) {
    const left = _getTagHashedMerkleRoot(args[0]);
    const right = _getTagHashedMerkleRoot(args[1]);
    return _tapBranchTaggedHash(left, right);
  }
  throw new Error("List cannot have more than 2 branches.");
}

function _tapleafTaggedHash(script) {
  const scriptBytes = this.prependVarint(script);
  const part = Buffer.concat([Buffer.from([0xc0]), scriptBytes]);
  return taggedHash("TapLeaf", part);
}

function prependVarint(data) {
  const varintBytes = this.encodeVarint(data.length);
  return Buffer.concat([varintBytes, data]);
}

function encodeVarint(i) {
  if (i < 253) {
    return Buffer.from([i]);
  } else if (i < 0x10000) {
    const buf = Buffer.alloc(3);
    buf.writeUInt8(0xfd, 0);
    buf.writeUInt16LE(i, 1);
    return buf;
  } else if (i < 0x100000000) {
    const buf = Buffer.alloc(5);
    buf.writeUInt8(0xfe, 0);
    buf.writeUInt32LE(i, 1);
    return buf;
  } else {
    throw new Error(`Integer is too large: ${i}`);
  }
}

function _tapBranchTaggedHash(a, b) {
  return this.taggedHash(
    "TapBranch",
    Buffer.compare(a, b) < 0 ? Buffer.concat([a, b]) : Buffer.concat([b, a])
  );
}

function calculatePrivateTweek(secret, tweek) {
  let negatedKey = new BN(secret);
  const publicKey = ec.g.mul(negatedKey);
  if (publicKey.getY().isOdd()) {
    negatedKey = ec.n.sub(negatedKey);
  }
  const tw = negatedKey.add(tweek).umod(ec.n);
  return tw.toArrayLike(Buffer, "be", 32);
}

function sha256(data) {
  return createHash("sha256").update(data).digest();
}

function taggedHash(data, tag) {
  const tagDigest = sha256(Buffer.from(tag, "utf8"));
  const concat = Buffer.concat([tagDigest, tagDigest, data]);
  return sha256(concat);
}

function sha256(data) {
  return createHash("sha256").update(data).digest();
}

module.exports = {
  toBytes,
  tweakMulPublic,
  tweakAddPublic,
  tweakAddPrivate,
  tweakMulPrivate,
  negate,
  pubNegate,
  toTweakedTaprootKey,
  taggedHash,
  _getTagHashedMerkleRoot,
  _tapleafTaggedHash,
  prependVarint,
  encodeVarint,
};
