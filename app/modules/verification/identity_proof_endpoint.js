'use strict';

function generateIdentityProof(credential) {
  return {
    credential_id: credential.credential_id,
    subject: credential.subject,
    token_type: credential.token_type,
    ledger_reference: credential.ledger_reference,
    proof_generated_at: new Date().toISOString()
  };
}

module.exports = generateIdentityProof;
