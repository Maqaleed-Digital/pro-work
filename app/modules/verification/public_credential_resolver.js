'use strict';

function resolveCredential(credentials, credentialId) {
  const match = credentials.find(c => c.credential_id === credentialId);
  if (!match) {
    return { found: false, reason: 'credential not found' };
  }
  return { found: true, credential: match };
}

module.exports = resolveCredential;
