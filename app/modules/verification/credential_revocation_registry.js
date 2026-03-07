'use strict';

class CredentialRevocationRegistry {
  constructor() {
    this.revoked = new Set();
  }

  revoke(credentialId) {
    this.revoked.add(credentialId);
    return { revoked: true, credential_id: credentialId };
  }

  isRevoked(credentialId) {
    return this.revoked.has(credentialId);
  }
}

module.exports = new CredentialRevocationRegistry();
