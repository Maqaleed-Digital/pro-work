class IdentityProtocolSpec {
  constructor() {
    this.version = "1.0"
    this.namespace = "prowork.identity"
  }

  getSpec() {
    return {
      version: this.version,
      namespace: this.namespace
    }
  }
}

module.exports = new IdentityProtocolSpec()
