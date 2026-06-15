'use strict';

function resolveExternalCredential(adapterName, credential) {
  return {
    adapter: adapterName,
    credential_id: credential.credential_id,
    ledger_reference: credential.ledger_reference,
    resolved_at: new Date().toISOString()
  };
}

module.exports = resolveExternalCredential;
