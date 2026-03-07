'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createOffboardingService, InMemoryOffboardingStore } = require('../app/modules/lifecycle/offboarding_service');

function hooks() {
  const events = [];
  return { events, publish: async (e) => events.push(e) };
}

test('offboarding service full flow emits expected events', async () => {
  const h = hooks();
  const svc = createOffboardingService({ store: new InMemoryOffboardingStore(), hooks: h });

  await svc.initiateCase({
    tenant_id: 't1',
    offboarding_case_id: 'o1',
    worker_id: 'w1'
  });

  await svc.completeChecklistItem({
    tenant_id: 't1',
    offboarding_case_id: 'o1',
    item_id: 'i1',
    title: 'Return laptop'
  });

  await svc.completeFinalSettlementChecklist({
    tenant_id: 't1',
    offboarding_case_id: 'o1',
    approver_ids: ['a1']
  });

  await svc.generateEvidencePack({
    tenant_id: 't1',
    offboarding_case_id: 'o1',
    evidence_pack_id: 'ep1',
    handover_count: 1
  });

  const out = await svc.completeOffboarding({
    tenant_id: 't1',
    offboarding_case_id: 'o1'
  });

  assert.equal(out.status, 'COMPLETED');
  assert.equal(h.events[h.events.length - 1].event_type, 'OFFBOARDING_COMPLETED');
});
