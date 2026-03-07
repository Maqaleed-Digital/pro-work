class CrossBorderVerifierMap {
  constructor() {
    this.map = new Map()
  }

  register(sourceVerifier, targetVerifier) {
    this.map.set(sourceVerifier, targetVerifier)

    return {
      source_verifier: sourceVerifier,
      target_verifier: targetVerifier
    }
  }

  get(sourceVerifier) {
    return this.map.get(sourceVerifier) || null
  }
}

module.exports = new CrossBorderVerifierMap()
