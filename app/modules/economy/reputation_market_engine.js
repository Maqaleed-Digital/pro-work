'use strict';

function updateReputationMarket(credential) {
  return {
    credential_id: credential.credential_id,
    market_score: credential.score || 0,
    updated_at: new Date().toISOString()
  };
}

module.exports = updateReputationMarket;
