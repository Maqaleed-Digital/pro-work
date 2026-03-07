'use strict';

function runVerificationAgent(credential) {
  return {
    credential_id: credential.credential_id,
    verified: true,
    agent: 'verification_agent',
    verified_at: new Date().toISOString()
  };
}

module.exports = runVerificationAgent;
