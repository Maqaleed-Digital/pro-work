'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { createApprovalService, InMemoryApprovalStore } = require('../app/modules/hiring/approval_service');

function makeHooks() {
  const events = [];
  return { events, publish: async (e) => events.push(e) };
}

const BASE = {
  hiring_case_id: 'case-1',
  actor_id:       'u-cfo',
  tenant_id:      '22222222-2222-2222-2222-222222222222',
};

describe('ApprovalService — requestApproval', () => {
  test('emits OFFER_APPROVAL_REQUESTED (STANDARD)', async () => {
    const h = makeHooks();
    const svc = createApprovalService({ store: new InMemoryApprovalStore(), hooks: h });
    const result = await svc.requestApproval(BASE);
    assert.equal(result.hiring_case_id, BASE.hiring_case_id);
    assert.equal(result.actor_id,       BASE.actor_id);
    assert.equal(h.events[0].event_type, 'OFFER_APPROVAL_REQUESTED');
    assert.equal(h.events[0].trust_level, 'STANDARD');
    assert.equal(h.events[0].requires_approval, false);
    assert.equal(h.events[0].payload.hiring_case_id, BASE.hiring_case_id);
  });

  test('rejects missing hiring_case_id', async () => {
    const svc = createApprovalService({ store: new InMemoryApprovalStore(), hooks: makeHooks() });
    await assert.rejects(() => svc.requestApproval({ ...BASE, hiring_case_id: '' }), /hiring_case_id is required/);
  });

  test('rejects missing actor_id', async () => {
    const svc = createApprovalService({ store: new InMemoryApprovalStore(), hooks: makeHooks() });
    await assert.rejects(() => svc.requestApproval({ ...BASE, actor_id: '' }), /actor_id is required/);
  });
});

describe('ApprovalService — approveOffer', () => {
  test('stores approval and emits OFFER_APPROVED (HIGH)', async () => {
    const h = makeHooks();
    const svc = createApprovalService({ store: new InMemoryApprovalStore(), hooks: h });
    const result = await svc.approveOffer(BASE);
    assert.equal(result, true);
    const evt = h.events.find(e => e.event_type === 'OFFER_APPROVED');
    assert.ok(evt);
    assert.equal(evt.trust_level, 'HIGH');
    assert.equal(evt.requires_approval, true);
    assert.equal(evt.payload.actor_id, BASE.actor_id);
    assert.equal(evt.aggregate_id, BASE.hiring_case_id);
  });

  test('stores approval record retrievable by hiring_case_id', async () => {
    const svc = createApprovalService({ store: new InMemoryApprovalStore(), hooks: makeHooks() });
    await svc.approveOffer(BASE);
    const stored = await svc.getApproval(BASE.hiring_case_id);
    assert.equal(stored.decision, 'APPROVED');
    assert.equal(stored.actor_id, BASE.actor_id);
  });

  test('rejects missing hiring_case_id', async () => {
    const svc = createApprovalService({ store: new InMemoryApprovalStore(), hooks: makeHooks() });
    await assert.rejects(() => svc.approveOffer({ ...BASE, hiring_case_id: '' }), /hiring_case_id is required/);
  });

  test('rejects missing actor_id', async () => {
    const svc = createApprovalService({ store: new InMemoryApprovalStore(), hooks: makeHooks() });
    await assert.rejects(() => svc.approveOffer({ ...BASE, actor_id: '' }), /actor_id is required/);
  });
});

describe('ApprovalService — listApprovals', () => {
  test('returns all stored approvals', async () => {
    const svc = createApprovalService({ store: new InMemoryApprovalStore(), hooks: makeHooks() });
    await svc.approveOffer(BASE);
    await svc.approveOffer({ ...BASE, hiring_case_id: 'case-2' });
    assert.equal((await svc.listApprovals()).length, 2);
  });
});
