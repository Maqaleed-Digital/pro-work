'use strict';

function resolveAcrossFabric(node, credentialId) {
  return {
    node,
    credential_id: credentialId,
    resolved_at: new Date().toISOString()
  };
}

module.exports = resolveAcrossFabric;
