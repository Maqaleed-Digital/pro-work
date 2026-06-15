'use strict';

function logPartnerVerification(verifier, credentialId) {
  return {
    verifier,
    credential_id: credentialId,
    verified_at: new Date().toISOString()
  };
}

module.exports = logPartnerVerification;
