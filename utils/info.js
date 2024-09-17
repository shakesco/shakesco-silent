class ECPrivateInfo {
  constructor(privkey, isTaproot, tweak = false) {
    this.privkey = privkey;
    this.isTaproot = isTaproot;
    this.tweak = tweak;
  }
}

module.exports = ECPrivateInfo;
