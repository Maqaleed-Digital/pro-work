'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { runOnce } = require('../app/modules/onboarding/day80_automation');
const {
  createProbationGovernanceService,
  InMemoryProbationGovernanceStore,
} = require('../app/modules/onboarding/probation_governance_service');

// ── fixtures ──────────────────────────────────────────────────────────────────

const NOW = new Date('2026-04-16T06:00:00Z');  // simulated job run time

function makeHooks() {
  const events = [];
  return { events, publish: async (e) => events.push(e) };
}

function makeDeps(hooks) {
  const store = new InMemoryProbationGovernanceStore();
  const svc   = createProbationGovernanceService({ store, hooks: hooks || makeHooks() });
  return { store, svc };
}

function dateAgo(days) {
  const d = new Date(NOW);
  d.setDate(d.getDate() - days);
  return d.toISOString();
}

function baseCase(id, daysAgo, overrides) {
  return {
    governance_case_id: id,
    worker_id:          `wkr-${id}`,
    tenant_id:          'tnt-001',
    onboarding_case_id: `onb-${id}`,
    started_at:         dateAgo(daysAgo),
    period_days:        90,
    occurred_at:        dateAgo(daysAgo),
    actor:              { actor_type: 'HUMAN', actor_id: 'hr-admin' },
    event_id:           `ev-${id}`,
    correlation_id:     'c',
    causation_id:       'c',
    ...overrides,
  };
}

// ── runOnce ───────────────────────────────────────────────────────────────────

describe('Day-80 Automation — runOnce', () => {
  test('compiles pack for cases exactly at day 80', async () => {
    const h = makeHooks();
    const { store, svc } = makeDeps(h);
    await svc.initiateProbation(baseCase('g001', 80));
    const result = await runOnce({ store, governanceService: svc, hooks: h, now: NOW });
    assert.equal(result.packs_compiled, 1);
    assert.equal(result.errors.length,  0);
  });

  test('compiles pack for cases past day 80 (e.g. day 85)', async () => {
    const h = makeHooks();
    const { store, svc } = makeDeps(h);
    await svc.initiateProbation(baseCase('g002', 85));
    const result = await runOnce({ store, governanceService: svc, hooks: h, now: NOW });
    assert.equal(result.packs_compiled, 1);
  });

  test('does NOT process cases before day 80 (e.g. day 75)', async () => {
    const h = makeHooks();
    const { store, svc } = makeDeps(h);
    await svc.initiateProbation(baseCase('g003', 75));
    const result = await runOnce({ store, governanceService: svc, hooks: h, now: NOW });
    assert.equal(result.packs_compiled,   0);
    assert.equal(result.cases_scanned,    0);
  });

  test('idempotent — second run does not recompile already-compiled packs', async () => {
    const h = makeHooks();
    const { store, svc } = makeDeps(h);
    await svc.initiateProbation(baseCase('g004', 82));
    const r1 = await runOnce({ store, governanceService: svc, hooks: h, now: NOW });
    const r2 = await runOnce({ store, governanceService: svc, hooks: h, now: NOW });
    assert.equal(r1.packs_compiled, 1);
    assert.equal(r2.packs_compiled, 0);  // already compiled; not reprocessed
    assert.equal(r2.cases_scanned,  0);
  });

  test('processes multiple due cases in one run', async () => {
    const h = makeHooks();
    const { store, svc } = makeDeps(h);
    await svc.initiateProbation(baseCase('g010', 80));
    await svc.initiateProbation(baseCase('g011', 85));
    await svc.initiateProbation(baseCase('g012', 90));
    const result = await runOnce({ store, governanceService: svc, hooks: h, now: NOW });
    assert.equal(result.packs_compiled, 3);
    assert.equal(result.cases_scanned,  3);
  });

  test('emits DAY80_PROBATION_NOTIFICATION event per case', async () => {
    const h = makeHooks();
    const { store, svc } = makeDeps(h);
    await svc.initiateProbation(baseCase('g020', 80));
    await runOnce({ store, governanceService: svc, hooks: h, now: NOW });
    const notifEvents = h.events.filter(e => e.event_type === 'DAY80_PROBATION_NOTIFICATION');
    assert.equal(notifEvents.length, 1);
    assert.ok(notifEvents[0].payload.notify_roles.includes('HR_MANAGER'));
    assert.ok(notifEvents[0].payload.notify_roles.includes('HIRING_MANAGER'));
  });

  test('notifications_sent count matches packs_compiled', async () => {
    const h = makeHooks();
    const { store, svc } = makeDeps(h);
    await svc.initiateProbation(baseCase('g030', 81));
    await svc.initiateProbation(baseCase('g031', 82));
    const result = await runOnce({ store, governanceService: svc, hooks: h, now: NOW });
    assert.equal(result.notifications_sent, result.packs_compiled);
  });

  test('skips cases that are not ACTIVE', async () => {
    const h = makeHooks();
    const { store, svc } = makeDeps(h);
    // Initiate then confirm (decision closes the case) — but recordDecision uses HUMAN actor
    // We'll just open a case and manually mark it via a 2nd store call not possible directly,
    // so instead test: only ACTIVE cases counted
    await svc.initiateProbation(baseCase('g040', 82));
    // Confirm the case first
    await svc.compileProbationEvidencePack({ governance_case_id: 'g040', compiled_at: dateAgo(5), event_id: 'evEP', correlation_id: 'c', causation_id: 'c' });
    await svc.recordDecision({
      governance_case_id: 'g040',
      decision: 'CONFIRM', reason_code: 'MEETS_REQUIREMENTS',
      actor: { actor_type: 'HUMAN', actor_id: 'hr1' },
      event_id: 'evD', correlation_id: 'c', causation_id: 'c',
    });
    const result = await runOnce({ store, governanceService: svc, hooks: h, now: NOW });
    // Already confirmed case — status CONFIRMED — findDay80Due filters to ACTIVE only
    assert.equal(result.packs_compiled, 0);
  });

  test('result object has expected shape', async () => {
    const h = makeHooks();
    const { store, svc } = makeDeps(h);
    const result = await runOnce({ store, governanceService: svc, hooks: h, now: NOW });
    assert.ok('run_at'            in result);
    assert.ok('cases_scanned'     in result);
    assert.ok('packs_compiled'    in result);
    assert.ok('already_compiled'  in result);
    assert.ok('errors'            in result);
    assert.ok('notifications_sent' in result);
  });

  test('errors array captures per-case failures without halting run', async () => {
    const h = makeHooks();
    const { store, svc } = makeDeps(h);
    // Add a valid case
    await svc.initiateProbation(baseCase('g050', 80));
    // Corrupt the store to cause a failure on a second fake record
    // (simulate by passing a svc that throws on one case)
    const brokenSvc = {
      compileProbationEvidencePack: async (input) => {
        if (input.governance_case_id === 'g050') throw new Error('simulated DB error');
        return {};
      },
    };
    const result = await runOnce({ store, governanceService: brokenSvc, hooks: h, now: NOW });
    assert.equal(result.errors.length, 1);
    assert.equal(result.errors[0].governance_case_id, 'g050');
    assert.ok(result.errors[0].error.includes('simulated DB error'));
  });
});
