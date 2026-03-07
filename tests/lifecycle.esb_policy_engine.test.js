'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createEsbPolicyEngine } = require('../app/modules/lifecycle/esb_policy_engine');

function hooks() {
  const events = [];
  return { events, publish: async (e) => events.push(e) };
}

test('ESB calculator emits trust-sensitive event', async () => {
  const h = hooks();
  const svc = createEsbPolicyEngine({ hooks: h });
  const out = await svc.calculate({
    tenant_id: 't1',
    offboarding_case_id: 'o1',
    policy_version: 'KSA-ESB-V1',
    months_of_service: 24,
    last_base_wage: 12000
  });
  assert.ok(out.calculated_amount >= 0);
  assert.equal(h.events[0].event_type, 'ESB_CALCULATION_EXECUTED');
  assert.equal(h.events[0].trust_level, 'HIGH');
});
