// Bech32 character set for encoding
const CHARSET = "qpzry9x8gf2tvdw0s3jn54khce6mua7l";

// Generator coefficients for checksum calculation
const GENERATOR = [0x3b6a57b2, 0x26508e6d, 0x1ea119fa, 0x3d4233dd, 0x2a1462b3];

const ENCODING_CONST = {
  bech32: 1,
  bech32m: 0x2bc830a3,
};

const Bech32Consts = {
  /// The separator character used in Bech32 encoded strings.
  separator: "1",

  /// The length of the checksum part in a Bech32 encoded string.
  checksumStrLen: 6,
};

// Bech32 encoding function
function encodeBech32(
  hrp,
  data,
  separator = Bech32Consts.separator,
  encoding = "bech32m"
) {
  const checksum = createChecksum(hrp, data, encoding);
  const combined = [...data, ...checksum];
  const encodedData = combined.map((value) => CHARSET[value]).join("");
  return `${hrp}${separator}${encodedData}`;
}

// Convert bytes to base32
function convertToBase32(data) {
  const result = [];
  let accumulator = 0;
  let bits = 0;
  const maxV = 31; // 5-bit chunks for base32

  for (const value of data) {
    accumulator = (accumulator << 8) | value;
    bits += 8;

    while (bits >= 5) {
      bits -= 5;
      result.push((accumulator >> bits) & maxV);
    }
  }

  if (bits > 0) {
    result.push((accumulator << (5 - bits)) & maxV);
  }

  return result;
}

function convertFromBase32(data) {
  const result = [];
  let accumulator = 0;
  let bits = 0;
  const maxV = 255; // 8-bit chunks for bytes

  for (const value of data) {
    accumulator = (accumulator << 5) | value;
    bits += 5;

    while (bits >= 8) {
      bits -= 8;
      result.push((accumulator >> bits) & maxV);
    }
  }

  return result;
}

// Create checksum
function createChecksum(hrp, data, encoding = "bech32m") {
  const values = [...expandHrp(hrp), ...data, 0, 0, 0, 0, 0, 0];
  const polymod = polyMod(values) ^ ENCODING_CONST[encoding];
  return Array.from({ length: 6 }, (_, i) => (polymod >> (5 * (5 - i))) & 31);
}

// Expand the human-readable part
function expandHrp(hrp) {
  const expand = [];
  for (let i = 0; i < hrp.length; i++) {
    expand.push(hrp.charCodeAt(i) >> 5);
  }
  expand.push(0);
  for (let i = 0; i < hrp.length; i++) {
    expand.push(hrp.charCodeAt(i) & 31);
  }
  return expand;
}

// PolyMod function for checksum calculation
function polyMod(values) {
  let chk = 1;
  for (const value of values) {
    const top = chk >> 25;
    chk = ((chk & 0x1ffffff) << 5) ^ value;
    for (let i = 0; i < 5; i++) {
      if ((top >> i) & 1) {
        chk ^= GENERATOR[i];
      }
    }
  }
  return chk;
}

function decodeBech32(
  bechStr,
  sep = Bech32Consts.separator,
  checksumLen = Bech32Consts.checksumStrLen,
  encoding = "bech32m"
) {
  if (_isStringMixed(bechStr)) {
    throw new Error("Invalid bech32 format (string is mixed case)");
  }

  bechStr = bechStr.toLowerCase();

  const sepPos = bechStr.lastIndexOf(sep);
  if (sepPos == -1) {
    throw new Error("Invalid bech32 format (no separator found)");
  }

  const hrp = bechStr.substring(0, sepPos);
  if (
    hrp.length === 0 ||
    hrp
      .split("")
      .some((char) => char.charCodeAt(0) < 33 || char.charCodeAt(0) > 126)
  ) {
    throw new Error(`Invalid bech32 format (HRP not valid: ${hrp})`);
  }

  const dataPart = bechStr.substring(sepPos + 1);

  if (
    dataPart.length < checksumLen + 1 ||
    dataPart.split("").some((char) => !CHARSET.includes(char))
  ) {
    throw new Error("Invalid bech32 format (data part not valid)");
  }

  const intData = dataPart.split("").map((char) => CHARSET.indexOf(char));

  if (!veriCheckSum(hrp, intData, encoding)) {
    throw new Error("Invalid bech32 checksum");
  }

  return [hrp, Array.from(intData.slice(0, intData.length - checksumLen))];
}

function veriCheckSum(hrp, data, encoding = "bech32m") {
  const polymod = polyMod([...expandHrp(hrp), ...data]);

  return polymod == ENCODING_CONST[encoding];
}

function _isStringMixed(str) {
  return str !== str.toLowerCase() && str !== str.toUpperCase();
}

module.exports = {
  convertToBase32,
  convertFromBase32,
  encodeBech32,
  decodeBech32,
};
