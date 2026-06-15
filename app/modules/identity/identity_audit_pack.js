'use strict';

function buildIdentityAuditPack(tokens) {
  return {
    generated_at: new Date().toISOString(),
    token_count: tokens.length,
    tokens
  };
}

module.exports = buildIdentityAuditPack;
