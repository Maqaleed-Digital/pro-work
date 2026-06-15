'use strict';

class FederatedVerifierRegistry {
  constructor() {
    this.verifiers = new Map();
  }

  register(verifierId, endpoint) {
    this.verifiers.set(verifierId, endpoint);
    return { registered: true, verifier_id: verifierId };
  }

  get(verifierId) {
    return this.verifiers.get(verifierId) || null;
  }
}

module.exports = new FederatedVerifierRegistry();
