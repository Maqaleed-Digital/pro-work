'use strict';

function validateReputationScope(actorTenant, targetTenant) {
  if (actorTenant !== targetTenant) {
    return { allowed: false, reason: 'cross-tenant reputation access denied' };
  }
  return { allowed: true };
}

module.exports = validateReputationScope;
