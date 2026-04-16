'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createHandoverService, InMemoryHandoverStore } = require('../app/modules/lifecycle/handover_service');

function hooks() {
  const events = [];
  return { events, publish: async (e) => events.push(e) };
}

test('handover service records handover and emits trust event', async () => {
  const h = hooks();
  const svc = createHandoverService({ store: new InMemoryHandoverStore(), hooks: h });
  const out = await svc.record({
    tenant_id: 't1',
    handover_id: 'h1',
    offboarding_case_id: 'o1',
    worker_id: 'w1',
    asset_type: 'LAPTOP'
  });
  assert.equal(out.asset_type, 'LAPTOP');
  assert.equal(h.events[0].event_type, 'HANDOVER_RECORDED');
});
