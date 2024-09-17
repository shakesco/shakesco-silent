class SilentPaymentScanningOutput {
  constructor(output, tweak, label = null) {
    this.output = output;
    this.tweak = tweak;
    this.label = label;
  }
}

module.exports = SilentPaymentScanningOutput;
