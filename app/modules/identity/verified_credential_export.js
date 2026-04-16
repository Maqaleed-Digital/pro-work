'use strict';

function exportCredential(token, ledgerLink) {
  return {
    credential_id: token.token_id,
    subject: token.owner_user_id,
    token_type: token.token_type,
    ledger_reference: ledgerLink.ledger_hash,
    issued_at: token.issued_at
  };
}

module.exports = exportCredential;
