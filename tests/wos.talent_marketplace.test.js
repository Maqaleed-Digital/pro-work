'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const {
  createTalentMarketplaceService,
  computeSkillMatch,
  computeUtilization,
  detectAllocationConflict,
  buildWorkerProfile,
  POLICY,
} = require('../app/modules/wos/talent_marketplace_service');

// ── fixtures ──────────────────────────────────────────────────────────────────

function makeWorker(overrides = {}) {
  return {
    worker_id:               overrides.worker_id   || 'w-001',
    tenant_id:               overrides.tenant_id   || 'tenant-1',
    display_name:            overrides.display_name || 'Test Worker',
    type:                    overrides.type         || 'FTE',
    status:                  overrides.status       || 'ACTIVE',
    skills:                  overrides.skills       || ['javascript', 'node'],
    weekly_available_hours:  overrides.weekly_available_hours ?? 40,
    current_allocations:     overrides.current_allocations    || [],
    compliance_status:       overrides.compliance_status      || 'OK',
    ...overrides,
  };
}

function makeWorkerStore(workers) {
  return { async list() { return workers; } };
}

function makeMockAuditLog() {
  const calls = [];
  return {
    calls,
    async write(entry) { calls.push(entry); },
  };
}

// ── computeSkillMatch ─────────────────────────────────────────────────────────

describe('computeSkillMatch', () => {
  test('exact match returns 100%', () => {
    assert.equal(computeSkillMatch(['javascript', 'node'], ['javascript', 'node']), 100);
  });

  test('partial match returns correct percentage', () => {
    assert.equal(computeSkillMatch(['javascript', 'node', 'react'], ['javascript', 'python']), 50);
  });

  test('no match returns 0%', () => {
    assert.equal(computeSkillMatch(['java', 'spring'], ['javascript', 'node']), 0);
  });

  test('returns 100 when required skills is empty', () => {
    assert.equal(computeSkillMatch(['javascript'], []), 100);
  });

  test('returns 0 when worker has no skills', () => {
    assert.equal(computeSkillMatch([], ['javascript']), 0);
  });

  test('case-insensitive matching', () => {
    assert.equal(computeSkillMatch(['JavaScript', 'NODE'], ['javascript', 'node']), 100);
  });
});

// ── computeUtilization ────────────────────────────────────────────────────────

describe('computeUtilization', () => {
  test('returns correct utilization percentage', () => {
    const worker = makeWorker({ weekly_available_hours: 40, current_allocations: [{ hours: 20 }, { hours: 10 }] });
    assert.equal(computeUtilization(worker), 75);
  });

  test('returns 0 when no allocations', () => {
    const worker = makeWorker({ current_allocations: [] });
    assert.equal(computeUtilization(worker), 0);
  });

  test('returns 100 when fully allocated', () => {
    const worker = makeWorker({ weekly_available_hours: 40, current_allocations: [{ hours: 40 }] });
    assert.equal(computeUtilization(worker), 100);
  });

  test('uses policy default when weekly_available_hours absent', () => {
    const worker = { worker_id: 'w-x', current_allocations: [{ hours: 20 }] };
    const pct = computeUtilization(worker);
    assert.equal(pct, Math.round((20 / POLICY.allocation.weeklyStandardHours) * 100));
  });
});

// ── detectAllocationConflict ──────────────────────────────────────────────────

describe('detectAllocationConflict', () => {
  test('conflict=false when within capacity', () => {
    const worker = makeWorker({ weekly_available_hours: 40, current_allocations: [{ hours: 20 }] });
    const result = detectAllocationConflict(worker, 10);
    assert.equal(result.conflict, false);
  });

  test('conflict=false at exact capacity (not over)', () => {
    const worker = makeWorker({ weekly_available_hours: 40, current_allocations: [{ hours: 20 }] });
    const result = detectAllocationConflict(worker, 20);
    assert.equal(result.conflict, false);
    assert.equal(result.would_allocate_total, 40);
  });

  test('conflict=true when over capacity', () => {
    const worker = makeWorker({ weekly_available_hours: 40, current_allocations: [{ hours: 30 }] });
    const result = detectAllocationConflict(worker, 15);
    assert.equal(result.conflict, true);
    assert.equal(result.would_allocate_total, 45);
  });

  test('conflict result always contains worker_id', () => {
    const worker = makeWorker({ worker_id: 'w-abc', weekly_available_hours: 40, current_allocations: [{ hours: 30 }] });
    const result = detectAllocationConflict(worker, 15);
    assert.equal(result.worker_id, 'w-abc');
  });

  test('conflict severity matches policy config', () => {
    const worker = makeWorker({ weekly_available_hours: 40, current_allocations: [{ hours: 30 }] });
    const result = detectAllocationConflict(worker, 15);
    assert.equal(result.severity, POLICY.allocation.conflictSeverity);
  });

  test('conflict result includes new_utilization_pct', () => {
    const worker = makeWorker({ weekly_available_hours: 40, current_allocations: [{ hours: 30 }] });
    const result = detectAllocationConflict(worker, 15);
    assert.equal(result.new_utilization_pct, Math.round((45 / 40) * 100));
  });

  test('throws when proposedHours is negative', () => {
    const worker = makeWorker();
    assert.throws(() => detectAllocationConflict(worker, -5), /TalentMarketplaceError/);
  });
});

// ── buildWorkerProfile ────────────────────────────────────────────────────────

describe('buildWorkerProfile', () => {
  test('worker_type always present for FTE', () => {
    const profile = buildWorkerProfile(makeWorker({ type: 'FTE' }), []);
    assert.equal(profile.worker_type, 'FTE');
  });

  test('worker_type always present for FREELANCER', () => {
    const profile = buildWorkerProfile(makeWorker({ type: 'FREELANCER' }), []);
    assert.equal(profile.worker_type, 'FREELANCER');
  });

  test('FTE profile includes FTE-specific extension fields', () => {
    const worker = makeWorker({ type: 'FTE', cost_center: 'CC-01', line_manager: 'mgr-1' });
    const profile = buildWorkerProfile(worker, []);
    assert.ok('cost_center'   in profile, 'cost_center present');
    assert.ok('line_manager'  in profile, 'line_manager present');
    assert.ok('contract_type' in profile, 'contract_type present');
  });

  test('FREELANCER profile does not include FTE-specific fields', () => {
    const worker = makeWorker({ type: 'FREELANCER' });
    const profile = buildWorkerProfile(worker, []);
    assert.ok(!('cost_center' in profile), 'cost_center absent for freelancer');
    assert.ok(!('line_manager' in profile), 'line_manager absent for freelancer');
  });

  test('skill_match_pct is computed from required skills', () => {
    const worker = makeWorker({ skills: ['javascript', 'node', 'react'] });
    const profile = buildWorkerProfile(worker, ['javascript', 'python']);
    assert.equal(profile.skill_match_pct, 50);
  });
});

// ── searchForRole — FTE-first ordering ───────────────────────────────────────

describe('searchForRole — FTE-first ordering', () => {
  test('FTE results appear before FREELANCER results in fallback mode', async () => {
    // Force fallback: FTE has no matching skills, freelancer does.
    // In fallback, all FTEs (even below-threshold) come before freelancers.
    const workers = [
      makeWorker({ worker_id: 'f-1', type: 'FREELANCER', skills: ['javascript'], tenant_id: 'tenant-1' }),
      makeWorker({ worker_id: 'e-1', type: 'FTE',        skills: [],             tenant_id: 'tenant-1' }),
    ];
    const svc = createTalentMarketplaceService({ workerStore: makeWorkerStore(workers) });
    const out = await svc.searchForRole({ tenant_id: 'tenant-1', required_skills: ['javascript'] });

    assert.equal(out.fallback_used, true, 'fallback triggered');
    const types = out.results.map(r => r.worker_type);
    const fteIdx        = types.indexOf('FTE');
    const freelancerIdx = types.indexOf('FREELANCER');
    assert.ok(fteIdx !== -1,          'FTE present in results');
    assert.ok(freelancerIdx !== -1,   'FREELANCER present in results');
    assert.ok(fteIdx < freelancerIdx, 'FTE before FREELANCER in fallback results');
  });

  test('viable FTE returned and fallback_used=false', async () => {
    const workers = [
      makeWorker({ worker_id: 'e-1', type: 'FTE', skills: ['javascript', 'node'], tenant_id: 'tenant-1' }),
    ];
    const svc = createTalentMarketplaceService({ workerStore: makeWorkerStore(workers) });
    const out = await svc.searchForRole({ tenant_id: 'tenant-1', required_skills: ['javascript'] });
    assert.equal(out.fallback_used, false);
    assert.equal(out.results[0].worker_id, 'e-1');
  });

  test('fallback_used=true when no FTE meets skill threshold', async () => {
    const workers = [
      makeWorker({ worker_id: 'e-1', type: 'FTE',        skills: [],             tenant_id: 'tenant-1' }),
      makeWorker({ worker_id: 'f-1', type: 'FREELANCER', skills: ['javascript'], tenant_id: 'tenant-1' }),
    ];
    const svc = createTalentMarketplaceService({ workerStore: makeWorkerStore(workers) });
    const out = await svc.searchForRole({ tenant_id: 'tenant-1', required_skills: ['javascript'] });
    assert.equal(out.fallback_used, true);
  });

  test('fallback_used=true when no FTE workers in tenant', async () => {
    const workers = [
      makeWorker({ worker_id: 'f-1', type: 'FREELANCER', skills: ['javascript'], tenant_id: 'tenant-1' }),
    ];
    const svc = createTalentMarketplaceService({ workerStore: makeWorkerStore(workers) });
    const out = await svc.searchForRole({ tenant_id: 'tenant-1', required_skills: ['javascript'] });
    assert.equal(out.fallback_used, true);
  });

  test('only returns workers from matching tenant', async () => {
    const workers = [
      makeWorker({ worker_id: 'e-1', type: 'FTE', skills: ['javascript'], tenant_id: 'tenant-1' }),
      makeWorker({ worker_id: 'e-2', type: 'FTE', skills: ['javascript'], tenant_id: 'tenant-2' }),
    ];
    const svc = createTalentMarketplaceService({ workerStore: makeWorkerStore(workers) });
    const out = await svc.searchForRole({ tenant_id: 'tenant-1', required_skills: ['javascript'] });
    assert.ok(out.results.every(r => r.tenant_id === 'tenant-1'), 'only tenant-1 results');
  });

  test('only returns ACTIVE workers', async () => {
    const workers = [
      makeWorker({ worker_id: 'e-1', type: 'FTE', skills: ['javascript'], tenant_id: 'tenant-1', status: 'INACTIVE' }),
      makeWorker({ worker_id: 'e-2', type: 'FTE', skills: ['javascript'], tenant_id: 'tenant-1', status: 'ACTIVE' }),
    ];
    const svc = createTalentMarketplaceService({ workerStore: makeWorkerStore(workers) });
    const out = await svc.searchForRole({ tenant_id: 'tenant-1', required_skills: ['javascript'] });
    assert.ok(out.results.every(r => r.worker_id !== 'e-1'), 'inactive worker excluded');
  });
});

// ── searchForRole — fallback audit logging ───────────────────────────────────

describe('searchForRole — fallback audit logging', () => {
  test('audit log called with action_type RECOMMENDATION on fallback', async () => {
    const auditLog = makeMockAuditLog();
    const workers = [
      makeWorker({ worker_id: 'e-1', type: 'FTE', skills: [], tenant_id: 'tenant-1' }),
    ];
    const svc = createTalentMarketplaceService({ workerStore: makeWorkerStore(workers), auditLogService: auditLog });
    await svc.searchForRole({ tenant_id: 'tenant-1', required_skills: ['javascript'] });
    assert.equal(auditLog.calls.length, 1, 'exactly one audit entry');
    assert.equal(auditLog.calls[0].action_type, 'RECOMMENDATION');
  });

  test('audit log entry contains fallback_rationale', async () => {
    const auditLog = makeMockAuditLog();
    const workers = [
      makeWorker({ worker_id: 'e-1', type: 'FTE', skills: [], tenant_id: 'tenant-1' }),
    ];
    const svc = createTalentMarketplaceService({ workerStore: makeWorkerStore(workers), auditLogService: auditLog });
    await svc.searchForRole({ tenant_id: 'tenant-1', required_skills: ['javascript'] });
    const entry = auditLog.calls[0];
    assert.ok(entry.rationale && entry.rationale.length > 0, 'rationale present and non-empty');
  });

  test('audit log NOT called when FTE fulfills role (no fallback)', async () => {
    const auditLog = makeMockAuditLog();
    const workers = [
      makeWorker({ worker_id: 'e-1', type: 'FTE', skills: ['javascript', 'node'], tenant_id: 'tenant-1' }),
    ];
    const svc = createTalentMarketplaceService({ workerStore: makeWorkerStore(workers), auditLogService: auditLog });
    await svc.searchForRole({ tenant_id: 'tenant-1', required_skills: ['javascript'] });
    assert.equal(auditLog.calls.length, 0, 'no audit entry when FTE fulfills role');
  });

  test('graceful when auditLogService absent — no fallback logging error', async () => {
    const workers = [
      makeWorker({ worker_id: 'e-1', type: 'FTE', skills: [], tenant_id: 'tenant-1' }),
    ];
    const svc = createTalentMarketplaceService({ workerStore: makeWorkerStore(workers) });
    // Should not throw even without auditLogService
    const out = await svc.searchForRole({ tenant_id: 'tenant-1', required_skills: ['javascript'] });
    assert.equal(out.fallback_used, true);
  });
});

// ── searchForRole — type indicator always present ────────────────────────────

describe('searchForRole — type indicator always present', () => {
  test('every result has worker_type field', async () => {
    const workers = [
      makeWorker({ worker_id: 'e-1', type: 'FTE',        skills: ['javascript'], tenant_id: 'tenant-1' }),
      makeWorker({ worker_id: 'f-1', type: 'FREELANCER', skills: ['javascript'], tenant_id: 'tenant-1' }),
    ];
    const svc = createTalentMarketplaceService({ workerStore: makeWorkerStore(workers) });
    const out = await svc.searchForRole({ tenant_id: 'tenant-1', required_skills: [] });
    out.results.forEach(r => {
      assert.ok(r.worker_type === 'FTE' || r.worker_type === 'FREELANCER',
        `worker_type present for ${r.worker_id}`);
    });
  });
});

// ── POLICY config ─────────────────────────────────────────────────────────────

describe('POLICY config', () => {
  test('version is v1', () => {
    assert.equal(POLICY.version, 'v1');
  });

  test('FTE-first minimum skill match is 60%', () => {
    assert.equal(POLICY.fteFirst.minimumSkillMatchPercent, 60);
  });

  test('weekly standard hours is 40', () => {
    assert.equal(POLICY.allocation.weeklyStandardHours, 40);
  });

  test('conflict severity is CONFLICT', () => {
    assert.equal(POLICY.allocation.conflictSeverity, 'CONFLICT');
  });

  test('audit log action type is RECOMMENDATION', () => {
    assert.equal(POLICY.auditLog.actionType, 'RECOMMENDATION');
  });
});
