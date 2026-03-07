'use strict';

class VerifierPolicyRegistry {
  constructor() {
    this.policies = new Map();
  }

  register(verifierId, policy) {
    this.policies.set(verifierId, policy);
    return { registered: true, verifier_id: verifierId };
  }

  get(verifierId) {
    return this.policies.get(verifierId) || null;
  }
}

module.exports = new VerifierPolicyRegistry();
