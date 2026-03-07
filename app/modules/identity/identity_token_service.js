'use strict';

class IdentityTokenService {
  issueToken(input) {
    return {
      token_id: input.token_id,
      owner_user_id: input.owner_user_id,
      token_type: input.token_type,
      source_event: input.source_event || '',
      payload_hash: input.payload_hash || '',
      issued_at: new Date().toISOString()
    };
  }
}

module.exports = new IdentityTokenService();
