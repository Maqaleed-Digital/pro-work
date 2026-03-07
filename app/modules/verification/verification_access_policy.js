'use strict';

function checkVerificationAccess(policy, request) {
  if (!policy) {
    return { allowed: false, reason: 'no policy defined' };
  }
  if (policy.allowed_verifiers.includes(request.verifier)) {
    return { allowed: true };
  }
  return { allowed: false, reason: 'verifier not permitted' };
}

module.exports = checkVerificationAccess;
