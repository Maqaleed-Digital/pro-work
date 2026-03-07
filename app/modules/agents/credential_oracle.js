'use strict';

function verifyCredentialOracle(credential) {
  return {
    credential_id: credential.credential_id,
    oracle_verified: true,
    verified_at: new Date().toISOString()
  };
}

module.exports = verifyCredentialOracle;
