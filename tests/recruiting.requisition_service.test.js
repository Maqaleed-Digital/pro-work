'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { createRequisitionService, InMemoryRequisitionStore, ALLOWED_STATUSES } = require('../app/modules/recruiting/requisition_service');

function makeHooks() {
  const events = [];
  return { events, publish: async (event) => events.push(event) };
}

const BASE_INPUT = {
  event_id:         '11111111-1111-1111-1111-111111111111',
  occurred_at:      '2026-03-06T20:00:00Z',
  tenant_id:        '22222222-2222-2222-2222-222222222222',
  requisition_id:   '33333333-3333-3333-3333-333333333333',
  establishment_id: '44444444-4444-4444-4444-444444444444',
  title:            'Senior Backend Engineer',
  role_family:      'Engineering',
  contract_type:    'FTE',
  required_skills:  ['node', 'postgres'],
  hiring_manager_id: '55555555-5555-5555-5555-555555555555',
  created_at:       '2026-03-06T20:00:00Z',
  actor:            { actor_type: 'HUMAN', actor_id: '66666666-6666-6666-6666-666666666666' },
  correlation_id:   '77777777-7777-7777-7777-777777777777',
  causation_id:     '88888888-8888-8888-8888-888888888888',
};

describe('RequisitionService — createRequisition', () => {
  test('creates requisition in DRAFT and emits REQUISITION_CREATED', async () => {
    const h = makeHooks();
    const svc = createRequisitionService({ store: new InMemoryRequisitionStore(), hooks: h });
    const r = await svc.createRequisition(BASE_INPUT);
    assert.equal(r.status, 'DRAFT');
    assert.equal(r.title, 'Senior Backend Engineer');
    assert.equal(r.internal_first, true);
    assert.equal(h.events.length, 1);
    assert.equal(h.events[0].event_type, 'REQUISITION_CREATED');
    assert.equal(h.events[0].trust_level, 'STANDARD');
  });

  test('rejects missing title', async () => {
    const h = makeHooks();
    const svc = createRequisitionService({ store: new InMemoryRequisitionStore(), hooks: h });
    await assert.rejects(() => svc.createRequisition({ ...BASE_INPUT, title: '' }), /title is required/);
  });

  test('rejects missing establishment_id', async () => {
    const h = makeHooks();
    const svc = createRequisitionService({ store: new InMemoryRequisitionStore(), hooks: h });
    await assert.rejects(() => svc.createRequisition({ ...BASE_INPUT, establishment_id: '' }), /establishment_id is required/);
  });

  test('rejects non-array required_skills', async () => {
    const h = makeHooks();
    const svc = createRequisitionService({ store: new InMemoryRequisitionStore(), hooks: h });
    await assert.rejects(() => svc.createRequisition({ ...BASE_INPUT, required_skills: 'node' }), /required_skills must be an array/);
  });
});

describe('RequisitionService — transitionStatus', () => {
  test('DRAFT → OPEN emits REQUISITION_STATUS_CHANGED (STANDARD)', async () => {
    const h = makeHooks();
    const svc = createRequisitionService({ store: new InMemoryRequisitionStore(), hooks: h });
    await svc.createRequisition(BASE_INPUT);
    const updated = await svc.transitionStatus({
      event_id:       'ev-2',
      occurred_at:    '2026-03-06T20:01:00Z',
      requisition_id: BASE_INPUT.requisition_id,
      next_status:    'OPEN',
      updated_at:     '2026-03-06T20:01:00Z',
      actor:          { actor_type: 'HUMAN', actor_id: 'u-mgr' },
      correlation_id: 'corr-2',
      causation_id:   'caus-2',
    });
    assert.equal(updated.status, 'OPEN');
    const evt = h.events.find(e => e.event_type === 'REQUISITION_STATUS_CHANGED');
    assert.ok(evt);
    assert.equal(evt.payload.previous_status, 'DRAFT');
    assert.equal(evt.payload.next_status, 'OPEN');
    assert.equal(evt.trust_level, 'STANDARD');
  });

  test('invalid transition throws', async () => {
    const h = makeHooks();
    const svc = createRequisitionService({ store: new InMemoryRequisitionStore(), hooks: h });
    await svc.createRequisition(BASE_INPUT);
    await assert.rejects(
      () => svc.transitionStatus({ ...BASE_INPUT, event_id: 'e2', occurred_at: 'x', requisition_id: BASE_INPUT.requisition_id, next_status: 'FILLED', updated_at: 'x' }),
      /invalid requisition transition/
    );
  });

  test('OFFER_PENDING → FILLED emits HIGH trust event with requires_approval=true', async () => {
    const h = makeHooks();
    const svc = createRequisitionService({ store: new InMemoryRequisitionStore(), hooks: h });
    await svc.createRequisition(BASE_INPUT);

    // Walk through: DRAFT→OPEN→SHORTLISTING→INTERVIEWING→OFFER_PENDING→FILLED
    const transitions = ['OPEN', 'SHORTLISTING', 'INTERVIEWING', 'OFFER_PENDING', 'FILLED'];
    for (const next_status of transitions) {
      await svc.transitionStatus({ event_id: `e-${next_status}`, occurred_at: 'x', requisition_id: BASE_INPUT.requisition_id, next_status, updated_at: 'x', actor: { actor_type: 'HUMAN', actor_id: 'u' }, correlation_id: 'c', causation_id: 'c' });
    }

    const filledEvt = h.events.filter(e => e.event_type === 'REQUISITION_STATUS_CHANGED').find(e => e.payload.next_status === 'FILLED');
    assert.ok(filledEvt);
    assert.equal(filledEvt.trust_level, 'HIGH');
    assert.equal(filledEvt.requires_approval, true);
  });
});

describe('RequisitionService — getRequisition / listRequisitions', () => {
  test('getRequisition returns stored requisition', async () => {
    const h = makeHooks();
    const svc = createRequisitionService({ store: new InMemoryRequisitionStore(), hooks: h });
    await svc.createRequisition(BASE_INPUT);
    const r = await svc.getRequisition(BASE_INPUT.requisition_id);
    assert.equal(r.requisition_id, BASE_INPUT.requisition_id);
  });

  test('listRequisitions returns all', async () => {
    const h = makeHooks();
    const svc = createRequisitionService({ store: new InMemoryRequisitionStore(), hooks: h });
    await svc.createRequisition(BASE_INPUT);
    await svc.createRequisition({ ...BASE_INPUT, requisition_id: 'req-2' });
    const all = await svc.listRequisitions();
    assert.equal(all.length, 2);
  });

  test('ALLOWED_STATUSES exported and contains expected keys', () => {
    assert.ok(ALLOWED_STATUSES instanceof Map);
    assert.ok(ALLOWED_STATUSES.has('DRAFT'));
    assert.ok(ALLOWED_STATUSES.has('FILLED'));
    assert.ok(ALLOWED_STATUSES.has('CANCELLED'));
  });
});
