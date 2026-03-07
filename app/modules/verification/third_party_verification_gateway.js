'use strict';

function createThirdPartyVerificationRequest(credential, verifier) {
  return {
    verifier,
    credential_id: credential.credential_id,
    ledger_reference: credential.ledger_reference,
    requested_at: new Date().toISOString()
  };
}

module.exports = createThirdPartyVerificationRequest;
