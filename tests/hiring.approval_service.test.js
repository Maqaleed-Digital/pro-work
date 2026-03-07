'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { createApprovalService, InMemoryApprovalStore } = require('../app/modules/hiring/approval_service');

function makeHooks() {
  const events = [];
  return { events, publish: async (e) => events.push(e) };
}

const BASE = {
  approval_id:    'aaaa0001-0000-0000-0000-000000000001',
  tenant_id:      '22222222-2222-2222-2222-222222222222',
  offer_id:       '33333333-3333-3333-3333-333333333333',
  requisition_id: '44444444-4444-4444-4444-444444444444',
  requested_by:   'u-hiring-manager',
  approver_id:    'u-cfo',
  approval_level: 'L2',
  requested_at:   '2026-03-07T08:00:00Z',
  created_at:     '2026-03-07T08:00:00Z',
  event_id:       '55555555-5555-5555-5555-555555555555',
  occurred_at:    '2026-03-07T08:00:00Z',
  actor:          { actor_type: 'HUMAN', actor_id: 'u-hiring-manager' },
  correlation_id: '66666666-6666-6666-6666-666666666666',
  causation_id:   '77777777-7777-7777-7777-777777777777',
};

describe('ApprovalService — requestApproval', () => {
  test('creates approval in PENDING and emits HIRING_APPROVAL_REQUESTED (STANDARD)', async () => {
    const h = makeHooks();
    const svc = createApprovalService({ store: new InMemoryApprovalStore(), hooks: h });
    const approval = await svc.requestApproval(BASE);
    assert.equal(approval.status, 'PENDING');
    assert.equal(approval.approval_level, 'L2');
    assert.equal(h.events[0].event_type, 'HIRING_APPROVAL_REQUESTED');
    assert.equal(h.events[0].trust_level, 'STANDARD');
    assert.equal(h.events[0].requires_approval, false);
  });

  test('defaults approval_level to L1', async () => {
    const svc = createApprovalService({ store: new InMemoryApprovalStore(), hooks: makeHooks() });
    const approval = await svc.requestApproval({ ...BASE, approval_level: undefined });
    assert.equal(approval.approval_level, 'L1');
  });

  test('rejects missing approval_id', async () => {
    const svc = createApprovalService({ store: new InMemoryApprovalStore(), hooks: makeHooks() });
    await assert.rejects(() => svc.requestApproval({ ...BASE, approval_id: '' }), /approval_id is required/);
  });

  test('rejects missing approver_id', async () => {
    const svc = createApprovalService({ store: new InMemoryApprovalStore(), hooks: makeHooks() });
    await assert.rejects(() => svc.requestApproval({ ...BASE, approver_id: '' }), /approver_id is required/);
  });
});

describe('ApprovalService — recordApproval', () => {
  test('approves PENDING approval and emits HIRING_APPROVAL_RECORDED (HIGH)', async () => {
    const h = makeHooks();
    const svc = createApprovalService({ store: new InMemoryApprovalStore(), hooks: h });
    await svc.requestApproval(BASE);

    const updated = await svc.recordApproval({
      approval_id: BASE.approval_id,
      approver_id: 'u-cfo',
      decision:    'APPROVED',
      decided_at:  '2026-03-07T09:00:00Z',
      notes:       'Budget confirmed',
      event_id:    'ev-rec-1',
      occurred_at: '2026-03-07T09:00:00Z',
      actor:       { actor_type: 'HUMAN', actor_id: 'u-cfo' },
      correlation_id: 'corr-r', causation_id: 'caus-r',
    });

    assert.equal(updated.status, 'APPROVED');
    assert.equal(updated.decision, 'APPROVED');
    const evt = h.events.find(e => e.event_type === 'HIRING_APPROVAL_RECORDED');
    assert.ok(evt);
    assert.equal(evt.trust_level, 'HIGH');
    assert.equal(evt.requires_approval, true);
    assert.equal(evt.payload.decision, 'APPROVED');
  });

  test('rejects PENDING approval and emits HIRING_APPROVAL_RECORDED with REJECTED', async () => {
    const h = makeHooks();
    const svc = createApprovalService({ store: new InMemoryApprovalStore(), hooks: h });
    await svc.requestApproval(BASE);

    const updated = await svc.recordApproval({
      approval_id: BASE.approval_id,
      approver_id: 'u-cfo',
      decision:    'REJECTED',
      decided_at:  '2026-03-07T09:00:00Z',
      event_id:    'ev-rec-2', occurred_at: '2026-03-07T09:00:00Z',
      actor:       { actor_type: 'HUMAN', actor_id: 'u-cfo' },
      correlation_id: 'corr-r2', causation_id: 'caus-r2',
    });

    assert.equal(updated.status, 'REJECTED');
    const evt = h.events.find(e => e.event_type === 'HIRING_APPROVAL_RECORDED');
    assert.ok(evt);
    assert.equal(evt.payload.decision, 'REJECTED');
  });

  test('rejects invalid decision value', async () => {
    const svc = createApprovalService({ store: new InMemoryApprovalStore(), hooks: makeHooks() });
    await svc.requestApproval(BASE);
    await assert.rejects(
      () => svc.recordApproval({ approval_id: BASE.approval_id, approver_id: 'u', decision: 'MAYBE' }),
      /decision must be APPROVED or REJECTED/,
    );
  });

  test('rejects recording decision on already-decided approval', async () => {
    const svc = createApprovalService({ store: new InMemoryApprovalStore(), hooks: makeHooks() });
    await svc.requestApproval(BASE);
    await svc.recordApproval({
      approval_id: BASE.approval_id, approver_id: 'u', decision: 'APPROVED', decided_at: 'x',
      event_id: 'ev-1', occurred_at: 'x', actor: { actor_type: 'HUMAN', actor_id: 'u' },
      correlation_id: 'c', causation_id: 'c',
    });
    await assert.rejects(
      () => svc.recordApproval({ approval_id: BASE.approval_id, approver_id: 'u', decision: 'APPROVED', decided_at: 'x' }),
      /must be PENDING to record decision/,
    );
  });

  test('throws when approval not found', async () => {
    const svc = createApprovalService({ store: new InMemoryApprovalStore(), hooks: makeHooks() });
    await assert.rejects(
      () => svc.recordApproval({ approval_id: 'missing', approver_id: 'u', decision: 'APPROVED' }),
      /not found/,
    );
  });
});

describe('ApprovalService — getApproval / listApprovals', () => {
  test('getApproval returns stored approval', async () => {
    const svc = createApprovalService({ store: new InMemoryApprovalStore(), hooks: makeHooks() });
    await svc.requestApproval(BASE);
    const approval = await svc.getApproval(BASE.approval_id);
    assert.equal(approval.approval_id, BASE.approval_id);
  });

  test('listApprovals returns all', async () => {
    const svc = createApprovalService({ store: new InMemoryApprovalStore(), hooks: makeHooks() });
    await svc.requestApproval(BASE);
    await svc.requestApproval({ ...BASE, approval_id: 'appr-2', event_id: 'ev-2' });
    assert.equal((await svc.listApprovals()).length, 2);
  });
});
