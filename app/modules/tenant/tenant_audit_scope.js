'use strict';

function applyTenantScope(events, tenantId) {
  return events.filter(e => e.tenant_id === tenantId);
}

module.exports = applyTenantScope;
