'use strict';

function generateGlobalProof(credential) {
  return {
    credential_id: credential.credential_id,
    ledger_reference: credential.ledger_reference,
    proof_scope: 'global',
    generated_at: new Date().toISOString()
  };
}

module.exports = generateGlobalProof;
