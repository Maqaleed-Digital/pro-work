'use strict';

function assert(condition, message) {
  if (!condition) {
    const err = new Error(message);
    err.name = 'ComplianceRiskRouterError';
    throw err;
  }
}

/**
 * createComplianceRiskRouter({ complianceRiskService })
 *
 * Routes:
 *   GET /compliance/risk/dashboard?tenant_id=xxx  — full risk dashboard
 *   GET /compliance/risk/score?tenant_id=xxx      — score only
 */
function createComplianceRiskRouter({ complianceRiskService }) {
  assert(complianceRiskService, 'complianceRiskService is required');

  return {
    async handle({ method, path, query }) {
      const tenantId = query && query.tenant_id;

      if (method === 'GET' && path === '/compliance/risk/dashboard') {
        assert(tenantId, 'tenant_id query param is required');
        const dashboard = await complianceRiskService.buildDashboard({ tenantId });
        return { status: 200, body: dashboard };
      }

      if (method === 'GET' && path === '/compliance/risk/score') {
        assert(tenantId, 'tenant_id query param is required');
        const dashboard = await complianceRiskService.buildDashboard({ tenantId });
        return {
          status: 200,
          body: {
            tenant_id:      tenantId,
            overall:        dashboard.overall,
            computed_at:    dashboard.computed_at,
            policy_version: dashboard.policy_version,
          },
        };
      }

      return { status: 404, body: { error: 'NOT_FOUND', message: 'Unknown compliance risk route' } };
    },
  };
}

module.exports = { createComplianceRiskRouter };
