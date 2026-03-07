'use strict';

function executeFabricRequest(nodeEndpoint, credential) {
  return {
    endpoint: nodeEndpoint,
    credential_id: credential.credential_id,
    request_executed_at: new Date().toISOString()
  };
}

module.exports = executeFabricRequest;
