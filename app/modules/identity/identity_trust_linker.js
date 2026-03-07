'use strict';

function linkIdentityToTrust(identityToken, ledgerEntry) {
  return {
    token_id: identityToken.token_id,
    ledger_hash: ledgerEntry.ledger_hash,
    linked_at: new Date().toISOString()
  };
}

module.exports = linkIdentityToTrust;
