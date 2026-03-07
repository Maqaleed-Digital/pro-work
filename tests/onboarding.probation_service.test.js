'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { createProbationService, InMemoryProbationStore } = require('../app/modules/onboarding/probation_service');

function makeHooks() {
  const events = [];
  return { events, publish: async (e) => events.push(e) };
}

const BASE_CASE = {
  probation_case_id:  '11111111-1111-1111-1111-111111111111',
  tenant_id:          '22222222-2222-2222-2222-222222222222',
  worker_id:          '33333333-3333-3333-3333-333333333333',
  onboarding_case_id: '44444444-4444-4444-4444-444444444444',
  started_at:         '2026-03-07T01:00:00Z',
};

describe('ProbationService — openProbationCase', () => {
  test('opens case with ACTIVE status and 90-day default', async () => {
    const svc = createProbationService({ store: new InMemoryProbationStore(), hooks: makeHooks() });
    const c = await svc.openProbationCase(BASE_CASE);
    assert.equal(c.status, 'ACTIVE');
    assert.equal(c.probation_days, 90);
    assert.equal(c.decision_status, 'PENDING');
  });

  test('rejects missing probation_case_id', async () => {
    const svc = createProbationService({ store: new InMemoryProbationStore(), hooks: makeHooks() });
    await assert.rejects(() => svc.openProbationCase({ ...BASE_CASE, probation_case_id: '' }), /probation_case_id is required/);
  });
});

describe('ProbationService — generateDay80Pack', () => {
  test('generates pack and emits PROBATION_PACK_GENERATED (HIGH)', async () => {
    const h = makeHooks();
    const svc = createProbationService({ store: new InMemoryProbationStore(), hooks: h });
    await svc.openProbationCase(BASE_CASE);

    const out = await svc.generateDay80Pack({
      probation_case_id:    BASE_CASE.probation_case_id,
      generated_at:         '2026-05-26T01:00:00Z',
      task_completion_count: 8,
      manager_review_count:  2,
      tenant_id:            BASE_CASE.tenant_id,
      event_id:             '55555555-5555-5555-5555-555555555555',
      occurred_at:          '2026-05-26T01:00:00Z',
      actor:                { actor_type: 'SYSTEM', actor_id: '66666666-6666-6666-6666-666666666666' },
      correlation_id:       '77777777-7777-7777-7777-777777777777',
      causation_id:         '88888888-8888-8888-8888-888888888888',
    });

    assert.equal(out.evidence_summary.task_completion_count, 8);
    assert.equal(h.events[0].event_type, 'PROBATION_PACK_GENERATED');
    assert.equal(h.events[0].trust_level, 'HIGH');
    assert.equal(h.events[0].requires_approval, true);
  });

  test('throws when probation case not found', async () => {
    const svc = createProbationService({ store: new InMemoryProbationStore(), hooks: makeHooks() });
    await assert.rejects(
      () => svc.generateDay80Pack({ probation_case_id: 'missing', generated_at: 'x' }),
      /probation case not found/,
    );
  });
});

describe('ProbationService — recordDecision', () => {
  test('CONFIRM emits PROBATION_DECISION_RECORDED (HIGH)', async () => {
    const h = makeHooks();
    const svc = createProbationService({ store: new InMemoryProbationStore(), hooks: h });
    await svc.openProbationCase(BASE_CASE);

    const out = await svc.recordDecision({
      probation_case_id: BASE_CASE.probation_case_id,
      decision:          'CONFIRM',
      reason_code:       'PASS',
      decision_at:       '2026-05-30T01:00:00Z',
      tenant_id:         BASE_CASE.tenant_id,
      event_id:          '99999999-9999-9999-9999-999999999999',
      occurred_at:       '2026-05-30T01:00:00Z',
      actor:             { actor_type: 'HUMAN', actor_id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' },
      correlation_id:    'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
      causation_id:      'cccccccc-cccc-cccc-cccc-cccccccccccc',
    });

    assert.equal(out.decision_status, 'CONFIRM');
    assert.equal(h.events[0].event_type, 'PROBATION_DECISION_RECORDED');
    assert.equal(h.events[0].trust_level, 'HIGH');
    assert.equal(h.events[0].requires_approval, true);
  });

  test('EXTEND stores extension_days', async () => {
    const h = makeHooks();
    const svc = createProbationService({ store: new InMemoryProbationStore(), hooks: h });
    await svc.openProbationCase(BASE_CASE);
    const out = await svc.recordDecision({
      probation_case_id: BASE_CASE.probation_case_id,
      decision: 'EXTEND', reason_code: 'NEEDS_MORE_TIME',
      decision_at: 'x', extension_days: 30,
      tenant_id: BASE_CASE.tenant_id,
      event_id: 'e1', occurred_at: 'x',
      actor: { actor_type: 'HUMAN', actor_id: 'u' },
      correlation_id: 'c', causation_id: 'c',
    });
    assert.equal(out.extension_days, 30);
  });

  test('rejects invalid decision', async () => {
    const svc = createProbationService({ store: new InMemoryProbationStore(), hooks: makeHooks() });
    await svc.openProbationCase(BASE_CASE);
    await assert.rejects(
      () => svc.recordDecision({ probation_case_id: BASE_CASE.probation_case_id, decision: 'INVALID', decision_at: 'x' }),
      /decision must be CONFIRM EXTEND or TERMINATE/,
    );
  });
});
