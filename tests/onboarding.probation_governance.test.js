'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const {
  createProbationGovernanceService,
  InMemoryProbationGovernanceStore,
  POLICY,
  daysSince,
} = require('../app/modules/onboarding/probation_governance_service');

// ── fixtures ──────────────────────────────────────────────────────────────────

const GOV_ID    = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const WORKER_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const TENANT_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
const CASE_ID   = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
const ACTOR     = { actor_type: 'HUMAN', actor_id: 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee' };

// Probation started 85 days ago (past day-80 trigger)
const START_85_AGO = (() => {
  const d = new Date('2026-04-16T00:00:00Z');
  d.setDate(d.getDate() - 85);
  return d.toISOString();
})();

// Probation started today
const START_TODAY = '2026-04-16T00:00:00Z';

function makeHooks() {
  const events = [];
  return { events, publish: async (e) => events.push(e) };
}

function makeSvc(hooks) {
  return createProbationGovernanceService({
    store: new InMemoryProbationGovernanceStore(),
    hooks: hooks || makeHooks(),
  });
}

function baseInitiate(overrides) {
  return {
    governance_case_id: GOV_ID,
    worker_id:          WORKER_ID,
    tenant_id:          TENANT_ID,
    onboarding_case_id: CASE_ID,
    started_at:         START_TODAY,
    period_days:        90,
    occurred_at:        '2026-04-16T10:00:00Z',
    actor:              ACTOR,
    event_id:           'ev-001',
    correlation_id:     'corr-001',
    causation_id:       'caus-001',
    ...overrides,
  };
}

// ── daysSince ─────────────────────────────────────────────────────────────────

describe('daysSince helper', () => {
  test('returns 0 on same day', () => {
    assert.equal(daysSince('2026-01-01T00:00:00Z', new Date('2026-01-01T00:00:00Z')), 0);
  });

  test('returns 80 after 80 days', () => {
    const start = new Date('2026-01-01T00:00:00Z');
    const now   = new Date(start.getTime() + 80 * 86_400_000);
    assert.equal(daysSince(start.toISOString(), now), 80);
  });
});

// ── initiateProbation ─────────────────────────────────────────────────────────

describe('ProbationGovernanceService — initiateProbation', () => {
  test('creates case with ACTIVE status and correct period', async () => {
    const svc = makeSvc();
    const rec = await svc.initiateProbation(baseInitiate());
    assert.equal(rec.status,           'ACTIVE');
    assert.equal(rec.period_days,      90);
    assert.equal(rec.decision_status,  'PENDING');
    assert.ok(rec.max_end_date,        'max_end_date set');
  });

  test('accepts 180-day probation period', async () => {
    const svc = makeSvc();
    const rec = await svc.initiateProbation(baseInitiate({ period_days: 180 }));
    assert.equal(rec.period_days, 180);
  });

  test('rejects non-policy period (e.g. 120)', async () => {
    const svc = makeSvc();
    await assert.rejects(
      () => svc.initiateProbation(baseInitiate({ period_days: 120 })),
      /period_days must be one of/
    );
  });

  test('max_end_date is 180 days from start regardless of period_days', async () => {
    const svc = makeSvc();
    const rec = await svc.initiateProbation(baseInitiate({ started_at: '2026-01-01T00:00:00Z' }));
    const expected = new Date('2026-01-01T00:00:00Z');
    expected.setDate(expected.getDate() + 180);
    assert.ok(rec.max_end_date.startsWith(expected.toISOString().slice(0, 10)));
  });

  test('emits PROBATION_INITIATED event', async () => {
    const h = makeHooks();
    const svc = createProbationGovernanceService({ store: new InMemoryProbationGovernanceStore(), hooks: h });
    await svc.initiateProbation(baseInitiate());
    const ev = h.events.find(e => e.event_type === 'PROBATION_INITIATED');
    assert.ok(ev, 'event emitted');
  });
});

// ── getStatus ─────────────────────────────────────────────────────────────────

describe('ProbationGovernanceService — getStatus', () => {
  test('ON_TRACK when before day 80', () => {
    const svc = makeSvc();
    const fakeRecord = { governance_case_id: GOV_ID, worker_id: WORKER_ID, started_at: START_TODAY, period_days: 90, days_remaining: 90, decision_status: 'PENDING', decision: null, decision_made_by: null, decision_at: null, max_end_date: '', evidence_pack_compiled_at: null };
    const s = svc.getStatus(fakeRecord, new Date('2026-04-16T00:00:00Z'));
    assert.equal(s.status_label, 'ON_TRACK');
    assert.equal(s.current_day, 0);
  });

  test('EVIDENCE_READY when day >= 80', () => {
    const svc = makeSvc();
    const fakeRecord = { governance_case_id: GOV_ID, worker_id: WORKER_ID, started_at: START_85_AGO, period_days: 90, decision_status: 'PENDING', decision: null, decision_made_by: null, decision_at: null, max_end_date: '', evidence_pack_compiled_at: null };
    const now = new Date('2026-04-16T00:00:00Z');
    const s = svc.getStatus(fakeRecord, now);
    assert.ok(s.current_day >= 80, `expected current_day >= 80, got ${s.current_day}`);
    assert.ok(['EVIDENCE_READY', 'DECISION_REQUIRED'].includes(s.status_label));
  });
});

// ── compileProbationEvidencePack ──────────────────────────────────────────────

describe('ProbationGovernanceService — compileProbationEvidencePack', () => {
  test('sets evidence_pack_compiled_at and evidence_pack_id', async () => {
    const svc = makeSvc();
    await svc.initiateProbation(baseInitiate());
    const updated = await svc.compileProbationEvidencePack({
      governance_case_id:    GOV_ID,
      evidence_pack_id:      'ep-001',
      compiled_at:           '2026-04-16T08:00:00Z',
      task_completion_count: 12,
      manager_review_count:  2,
      policy_ack_count:      5,
      event_id: 'ev-ep', correlation_id: 'c', causation_id: 'c',
    });
    assert.ok(updated.evidence_pack_compiled_at, 'compiled_at set');
    assert.equal(updated.evidence_pack_id, 'ep-001');
    assert.equal(updated.evidence_signals.task_completion_count, 12);
  });

  test('idempotent — re-calling returns existing record unchanged', async () => {
    const svc = makeSvc();
    await svc.initiateProbation(baseInitiate());
    const first  = await svc.compileProbationEvidencePack({ governance_case_id: GOV_ID, compiled_at: '2026-04-16T08:00:00Z', event_id: 'ev1', correlation_id: 'c', causation_id: 'c' });
    const second = await svc.compileProbationEvidencePack({ governance_case_id: GOV_ID, compiled_at: '2026-04-16T09:00:00Z', event_id: 'ev2', correlation_id: 'c', causation_id: 'c' });
    assert.equal(first.evidence_pack_compiled_at, second.evidence_pack_compiled_at);
  });

  test('emits PROBATION_EVIDENCE_PACK_COMPILED event', async () => {
    const h = makeHooks();
    const svc = createProbationGovernanceService({ store: new InMemoryProbationGovernanceStore(), hooks: h });
    await svc.initiateProbation(baseInitiate());
    await svc.compileProbationEvidencePack({ governance_case_id: GOV_ID, compiled_at: '2026-04-16T08:00:00Z', event_id: 'ev1', correlation_id: 'c', causation_id: 'c' });
    const ev = h.events.find(e => e.event_type === 'PROBATION_EVIDENCE_PACK_COMPILED');
    assert.ok(ev, 'event emitted');
  });
});

// ── recordDecision — CONFIRM ──────────────────────────────────────────────────

describe('ProbationGovernanceService — recordDecision CONFIRM', () => {
  test('confirms with HUMAN actor and valid reason code', async () => {
    const svc = makeSvc();
    await svc.initiateProbation(baseInitiate());
    const updated = await svc.recordDecision({
      governance_case_id: GOV_ID,
      decision:           'CONFIRM',
      reason_code:        'MEETS_REQUIREMENTS',
      actor:              ACTOR,
      decision_at:        '2026-04-16T10:00:00Z',
      event_id: 'ev2', correlation_id: 'c', causation_id: 'c',
    });
    assert.equal(updated.decision,        'CONFIRM');
    assert.equal(updated.status,          'CONFIRMED');
    assert.equal(updated.decision_made_by, ACTOR.actor_id);
  });

  test('rejects SYSTEM actor — human-only gate', async () => {
    const svc = makeSvc();
    await svc.initiateProbation(baseInitiate());
    await assert.rejects(
      () => svc.recordDecision({
        governance_case_id: GOV_ID,
        decision: 'CONFIRM', reason_code: 'MEETS_REQUIREMENTS',
        actor: { actor_type: 'SYSTEM', actor_id: 'auto' },
        event_id: 'ev', correlation_id: 'c', causation_id: 'c',
      }),
      /HUMAN actor/
    );
  });
});

// ── recordDecision — EXTEND ───────────────────────────────────────────────────

describe('ProbationGovernanceService — recordDecision EXTEND', () => {
  test('extends within 180-day ceiling', async () => {
    const svc = makeSvc();
    await svc.initiateProbation(baseInitiate({ period_days: 90 }));
    const updated = await svc.recordDecision({
      governance_case_id: GOV_ID,
      decision:           'EXTEND',
      reason_code:        'PERFORMANCE_IMPROVEMENT_NEEDED',
      extension_days:     90,
      actor:              ACTOR,
      event_id: 'ev3', correlation_id: 'c', causation_id: 'c',
    });
    assert.equal(updated.extension_days, 90);
    assert.equal(updated.period_days,    180);  // 90 + 90
  });

  test('rejects extension that exceeds 180-day ceiling', async () => {
    const svc = makeSvc();
    await svc.initiateProbation(baseInitiate({ period_days: 90 }));
    await assert.rejects(
      () => svc.recordDecision({
        governance_case_id: GOV_ID,
        decision: 'EXTEND', reason_code: 'PERFORMANCE_IMPROVEMENT_NEEDED',
        extension_days: 100,  // 90 + 100 = 190 > 180
        actor: ACTOR,
        event_id: 'ev', correlation_id: 'c', causation_id: 'c',
      }),
      /maximum of 180 days/
    );
  });
});

// ── recordDecision — TERMINATE ────────────────────────────────────────────────

describe('ProbationGovernanceService — recordDecision TERMINATE', () => {
  test('terminates with all required fields', async () => {
    const svc = makeSvc();
    await svc.initiateProbation(baseInitiate());
    const updated = await svc.recordDecision({
      governance_case_id:    GOV_ID,
      decision:              'TERMINATE',
      reason_code:           'PERFORMANCE_INSUFFICIENT',
      termination_reason_code: 'PERFORMANCE_INSUFFICIENT',
      notice_details:        { text: '14 days notice', effective_date: '2026-05-01' },
      settlement_checklist:  POLICY.settlementChecklistItems,
      actor:                 ACTOR,
      event_id: 'ev4', correlation_id: 'c', causation_id: 'c',
    });
    assert.equal(updated.status,   'TERMINATED');
    assert.equal(updated.decision, 'TERMINATE');
    assert.ok(Array.isArray(updated.settlement_checklist));
  });

  test('rejects TERMINATE without settlement_checklist', async () => {
    const svc = makeSvc();
    await svc.initiateProbation(baseInitiate());
    await assert.rejects(
      () => svc.recordDecision({
        governance_case_id: GOV_ID,
        decision: 'TERMINATE', reason_code: 'PERFORMANCE_INSUFFICIENT',
        termination_reason_code: 'PERFORMANCE_INSUFFICIENT',
        notice_details: { text: 'test' },
        actor: ACTOR,
        event_id: 'ev', correlation_id: 'c', causation_id: 'c',
      }),
      /settlement_checklist is required/
    );
  });

  test('rejects TERMINATE with incomplete settlement checklist', async () => {
    const svc = makeSvc();
    await svc.initiateProbation(baseInitiate());
    await assert.rejects(
      () => svc.recordDecision({
        governance_case_id: GOV_ID,
        decision: 'TERMINATE', reason_code: 'PERFORMANCE_INSUFFICIENT',
        termination_reason_code: 'PERFORMANCE_INSUFFICIENT',
        notice_details: { text: 'test' },
        settlement_checklist: ['final_salary_calculated'],  // missing items
        actor: ACTOR,
        event_id: 'ev', correlation_id: 'c', causation_id: 'c',
      }),
      /settlement_checklist missing required items/
    );
  });

  test('rejects TERMINATE without notice_details', async () => {
    const svc = makeSvc();
    await svc.initiateProbation(baseInitiate());
    await assert.rejects(
      () => svc.recordDecision({
        governance_case_id: GOV_ID,
        decision: 'TERMINATE', reason_code: 'PERFORMANCE_INSUFFICIENT',
        termination_reason_code: 'PERFORMANCE_INSUFFICIENT',
        settlement_checklist: POLICY.settlementChecklistItems,
        actor: ACTOR,
        event_id: 'ev', correlation_id: 'c', causation_id: 'c',
      }),
      /notice_details is required/
    );
  });
});

// ── POLICY config ─────────────────────────────────────────────────────────────

describe('POLICY config', () => {
  test('maxTotalDays is 180', () => {
    assert.equal(POLICY.maxTotalDays, 180);
  });

  test('day80TriggerDayNumber is 80', () => {
    assert.equal(POLICY.day80TriggerDayNumber, 80);
  });

  test('settlementChecklistItems has 6 entries', () => {
    assert.equal(POLICY.settlementChecklistItems.length, 6);
  });
});
