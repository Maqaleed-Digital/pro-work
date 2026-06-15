'use strict';

function verifyCredential(credential) {
  if (!credential) {
    return { valid: false, reason: 'missing credential' };
  }
  if (!credential.credential_id || !credential.ledger_reference) {
    return { valid: false, reason: 'credential missing required fields' };
  }
  return {
    valid: true,
    credential_id: credential.credential_id,
    ledger_reference: credential.ledger_reference
  };
}

module.exports = verifyCredential;
