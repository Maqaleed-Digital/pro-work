'use strict';

function resolveTenantContext(req) {
  const tenantId = req.headers['x-tenant-id'];
  if (!tenantId) {
    return { valid: false, reason: 'missing tenant header' };
  }
  return { valid: true, tenant_id: tenantId };
}

module.exports = resolveTenantContext;
