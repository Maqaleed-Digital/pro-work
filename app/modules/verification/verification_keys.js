'use strict';

class VerificationKeys {
  constructor() {
    this.keys = new Map();
  }

  register(keyId, publicKey) {
    this.keys.set(keyId, publicKey);
    return { registered: true, key_id: keyId };
  }

  get(keyId) {
    return this.keys.get(keyId) || null;
  }
}

module.exports = new VerificationKeys();
