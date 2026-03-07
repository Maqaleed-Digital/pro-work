'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { createDecisionService, InMemoryDecisionStore } = require('../app/modules/hiring/decision_service');

function makeHooks() {
  const events = [];
  return { events, publish: async (e) => events.push(e) };
}

const BASE = {
  decision_id:    'cccc0001-0000-0000-0000-000000000001',
  tenant_id:      '22222222-2222-2222-2222-222222222222',
  requisition_id: '33333333-3333-3333-3333-333333333333',
  candidate_id:   '44444444-4444-4444-4444-444444444444',
  offer_id:       '55555555-5555-5555-5555-555555555555',
  decision:       'HIRED',
  decided_by:     'u-cto',
  decision_reason: 'Best fit for the role',
  decided_at:     '2026-03-07T11:00:00Z',
  created_at:     '2026-03-07T11:00:00Z',
  event_id:       '66666666-6666-6666-6666-666666666666',
  occurred_at:    '2026-03-07T11:00:00Z',
  actor:          { actor_type: 'HUMAN', actor_id: 'u-cto' },
  correlation_id: '77777777-7777-7777-7777-777777777777',
  causation_id:   '88888888-8888-8888-8888-888888888888',
};

describe('DecisionService — recordDecision', () => {
  test('records HIRED decision and emits HIRING_DECISION_RECORDED (HIGH)', async () => {
    const h = makeHooks();
    const svc = createDecisionService({ store: new InMemoryDecisionStore(), hooks: h });
    const record = await svc.recordDecision(BASE);
    assert.equal(record.decision, 'HIRED');
    assert.equal(record.decided_by, 'u-cto');
    assert.equal(record.decision_reason, 'Best fit for the role');
    const evt = h.events[0];
    assert.equal(evt.event_type, 'HIRING_DECISION_RECORDED');
    assert.equal(evt.trust_level, 'HIGH');
    assert.equal(evt.requires_approval, true);
    assert.equal(evt.aggregate_type, 'HIRING_DECISION');
    assert.equal(evt.aggregate_id, BASE.decision_id);
    assert.equal(evt.payload.decision, 'HIRED');
  });

  test('records NOT_HIRED decision', async () => {
    const h = makeHooks();
    const svc = createDecisionService({ store: new InMemoryDecisionStore(), hooks: h });
    const record = await svc.recordDecision({ ...BASE, decision: 'NOT_HIRED', event_id: 'ev-2', decision_id: 'dec-2' });
    assert.equal(record.decision, 'NOT_HIRED');
    assert.equal(h.events[0].payload.decision, 'NOT_HIRED');
  });

  test('offer_id is optional', async () => {
    const svc = createDecisionService({ store: new InMemoryDecisionStore(), hooks: makeHooks() });
    const record = await svc.recordDecision({ ...BASE, offer_id: undefined, decision_id: 'dec-3', event_id: 'ev-3' });
    assert.equal(record.offer_id, null);
  });

  test('rejects invalid decision value', async () => {
    const svc = createDecisionService({ store: new InMemoryDecisionStore(), hooks: makeHooks() });
    await assert.rejects(
      () => svc.recordDecision({ ...BASE, decision: 'MAYBE' }),
      /decision must be HIRED or NOT_HIRED/,
    );
  });

  test('rejects missing decision_id', async () => {
    const svc = createDecisionService({ store: new InMemoryDecisionStore(), hooks: makeHooks() });
    await assert.rejects(
      () => svc.recordDecision({ ...BASE, decision_id: '' }),
      /decision_id is required/,
    );
  });

  test('rejects missing decided_by', async () => {
    const svc = createDecisionService({ store: new InMemoryDecisionStore(), hooks: makeHooks() });
    await assert.rejects(
      () => svc.recordDecision({ ...BASE, decided_by: '' }),
      /decided_by is required/,
    );
  });

  test('rejects missing candidate_id', async () => {
    const svc = createDecisionService({ store: new InMemoryDecisionStore(), hooks: makeHooks() });
    await assert.rejects(
      () => svc.recordDecision({ ...BASE, candidate_id: '' }),
      /candidate_id is required/,
    );
  });
});

describe('DecisionService — getDecision / listDecisions', () => {
  test('getDecision returns stored record', async () => {
    const svc = createDecisionService({ store: new InMemoryDecisionStore(), hooks: makeHooks() });
    await svc.recordDecision(BASE);
    const rec = await svc.getDecision(BASE.decision_id);
    assert.equal(rec.decision_id, BASE.decision_id);
  });

  test('listDecisions returns all', async () => {
    const svc = createDecisionService({ store: new InMemoryDecisionStore(), hooks: makeHooks() });
    await svc.recordDecision(BASE);
    await svc.recordDecision({ ...BASE, decision_id: 'dec-2', event_id: 'ev-2' });
    assert.equal((await svc.listDecisions()).length, 2);
  });
});
