'use strict';

// S36-G3: Nitaqat policy engine tests
// Run: node --test tests/compliance/nitaqat.test.js

const test   = require('node:test');
const assert = require('node:assert/strict');
const path   = require('path');

const { createNitaqatPolicyEngine, InMemoryOverrideStore, ZONES } =
  require('../../app/modules/compliance/nitaqat_service');

const policy = require('../../app/config/compliance/nitaqat_policy_v1.json');

// ── Shared engine instance ────────────────────────────────────────────────────
const engine = createNitaqatPolicyEngine(policy);

// ── Helper: base params for a neutral non-Saudi FTE hire ─────────────────────
function baseParams(overrides = {}) {
  return {
    establishmentProfile: {
      saudiCount:   10,
      totalCount:   50,
      activityCode: 'default',
      ...((overrides.establishmentProfile) || {}),
    },
    candidateNationality: 'US',
    contractType:         'FTE',
    ...overrides,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. Result shape — all required fields present
// ─────────────────────────────────────────────────────────────────────────────
test('calculateImpact returns all required fields', () => {
  const result = engine.calculateImpact(baseParams());
  assert.ok('currentZone'           in result, 'currentZone missing');
  assert.ok('projectedZone'         in result, 'projectedZone missing');
  assert.ok('saudiPercentageBefore' in result, 'saudiPercentageBefore missing');
  assert.ok('saudiPercentageAfter'  in result, 'saudiPercentageAfter missing');
  assert.ok('confidenceBand'        in result, 'confidenceBand missing');
  assert.ok('influencingFactors'    in result, 'influencingFactors missing');
  assert.ok('explanation'           in result, 'explanation missing');
  assert.ok('en'                    in result.explanation, 'explanation.en missing');
  assert.ok('ar'                    in result.explanation, 'explanation.ar missing');
});

// ─────────────────────────────────────────────────────────────────────────────
// 2–7. Zone mapping — all six zones
// ─────────────────────────────────────────────────────────────────────────────
test('zone RED — 0% Saudi (0 of 10)', () => {
  const result = engine.calculateImpact(baseParams({
    establishmentProfile: { saudiCount: 0, totalCount: 10 },
    candidateNationality: 'US',
  }));
  assert.equal(result.currentZone, ZONES.RED);
});

test('zone YELLOW — 15% Saudi (3 of 20)', () => {
  const result = engine.calculateImpact(baseParams({
    establishmentProfile: { saudiCount: 3, totalCount: 20 },
    candidateNationality: 'US',
  }));
  assert.equal(result.currentZone, ZONES.YELLOW);
});

test('zone LOW_GREEN — 25% Saudi (5 of 20)', () => {
  const result = engine.calculateImpact(baseParams({
    establishmentProfile: { saudiCount: 5, totalCount: 20 },
    candidateNationality: 'US',
  }));
  assert.equal(result.currentZone, ZONES.LOW_GREEN);
});

test('zone MEDIUM_GREEN — 35% Saudi (7 of 20)', () => {
  const result = engine.calculateImpact(baseParams({
    establishmentProfile: { saudiCount: 7, totalCount: 20 },
    candidateNationality: 'US',
  }));
  assert.equal(result.currentZone, ZONES.MEDIUM_GREEN);
});

test('zone HIGH_GREEN — 40% Saudi (8 of 20)', () => {
  const result = engine.calculateImpact(baseParams({
    establishmentProfile: { saudiCount: 8, totalCount: 20 },
    candidateNationality: 'US',
  }));
  assert.equal(result.currentZone, ZONES.HIGH_GREEN);
});

test('zone PLATINUM — 50% Saudi (10 of 20)', () => {
  const result = engine.calculateImpact(baseParams({
    establishmentProfile: { saudiCount: 10, totalCount: 20 },
    candidateNationality: 'US',
  }));
  assert.equal(result.currentZone, ZONES.PLATINUM);
});

// ─────────────────────────────────────────────────────────────────────────────
// 8–9. Saudi percentage calculation — before and after
// ─────────────────────────────────────────────────────────────────────────────
test('saudiPercentageBefore calculated correctly', () => {
  // 10 of 40 = 25%
  const result = engine.calculateImpact(baseParams({
    establishmentProfile: { saudiCount: 10, totalCount: 40 },
  }));
  assert.equal(result.saudiPercentageBefore, 25);
});

test('saudiPercentageAfter increases when hiring Saudi FTE', () => {
  // 10/40 = 25% before; 11/41 ≈ 26.83% after
  const result = engine.calculateImpact(baseParams({
    establishmentProfile: { saudiCount: 10, totalCount: 40 },
    candidateNationality: 'SA',
    contractType: 'FTE',
  }));
  assert.ok(result.saudiPercentageAfter > result.saudiPercentageBefore,
    'Saudi FTE hire should increase saudi percentage');
  assert.equal(result.saudiPercentageAfter, Math.round((11 / 41) * 100 * 100) / 100);
});

// ─────────────────────────────────────────────────────────────────────────────
// 10. Non-Saudi hire — percentage decreases
// ─────────────────────────────────────────────────────────────────────────────
test('saudiPercentageAfter decreases when hiring non-Saudi', () => {
  // 10/40 = 25% before; 10/41 ≈ 24.39% after
  const result = engine.calculateImpact(baseParams({
    establishmentProfile: { saudiCount: 10, totalCount: 40 },
    candidateNationality: 'EG',
    contractType: 'FTE',
  }));
  assert.ok(result.saudiPercentageAfter < result.saudiPercentageBefore,
    'non-Saudi hire should decrease saudi percentage');
});

// ─────────────────────────────────────────────────────────────────────────────
// 11. FREELANCER contract — reduced headcount weight
// ─────────────────────────────────────────────────────────────────────────────
test('FREELANCER Saudi hire increases percentage less than FTE', () => {
  const paramsBase = { establishmentProfile: { saudiCount: 10, totalCount: 40 }, candidateNationality: 'SA' };
  const fte       = engine.calculateImpact(baseParams({ ...paramsBase, contractType: 'FTE' }));
  const freelance = engine.calculateImpact(baseParams({ ...paramsBase, contractType: 'FREELANCER' }));
  assert.ok(freelance.saudiPercentageAfter < fte.saudiPercentageAfter,
    'freelancer should have smaller impact than FTE');
});

// ─────────────────────────────────────────────────────────────────────────────
// 12–13. Confidence band — never single-point
// ─────────────────────────────────────────────────────────────────────────────
test('confidenceBand.low is strictly less than confidenceBand.high', () => {
  const result = engine.calculateImpact(baseParams());
  assert.ok(result.confidenceBand.low < result.confidenceBand.high,
    'band.low must be < band.high');
});

test('confidenceBand present even when projected zone is at exact boundary', () => {
  // 5/20 = 25.0% — exactly at LOW_GREEN boundary
  const result = engine.calculateImpact(baseParams({
    establishmentProfile: { saudiCount: 5, totalCount: 20 },
    candidateNationality: 'US',
  }));
  assert.ok(result.confidenceBand.low  >= 0,   'band.low must be >= 0');
  assert.ok(result.confidenceBand.high <= 100, 'band.high must be <= 100');
  assert.ok(result.confidenceBand.low < result.confidenceBand.high,
    'band must have non-zero width at boundary');
});

// ─────────────────────────────────────────────────────────────────────────────
// 14–15. Explanation — both languages mandatory on every result
// ─────────────────────────────────────────────────────────────────────────────
test('explanation.ar is a non-empty string on every result', () => {
  const cases = [
    baseParams({ candidateNationality: 'SA', contractType: 'FTE' }),
    baseParams({ candidateNationality: 'US', contractType: 'FTE' }),
    baseParams({ candidateNationality: 'SA', contractType: 'FREELANCER' }),
    baseParams({ establishmentProfile: { saudiCount: 0, totalCount: 5 }, candidateNationality: 'SA' }),
  ];
  for (const params of cases) {
    const result = engine.calculateImpact(params);
    assert.ok(typeof result.explanation.ar === 'string' && result.explanation.ar.length > 0,
      'explanation.ar must be a non-empty string');
  }
});

test('explanation.en is a non-empty string on every result', () => {
  const result = engine.calculateImpact(baseParams({ candidateNationality: 'SA', contractType: 'FTE' }));
  assert.ok(typeof result.explanation.en === 'string' && result.explanation.en.length > 0,
    'explanation.en must be a non-empty string');
});

// ─────────────────────────────────────────────────────────────────────────────
// 16. YELLOW → LOW_GREEN zone transition
// ─────────────────────────────────────────────────────────────────────────────
test('YELLOW to LOW_GREEN transition when hiring Saudi FTE', () => {
  // 4/17 ≈ 23.53% → YELLOW
  // 5/18 ≈ 27.78% → LOW_GREEN
  const result = engine.calculateImpact(baseParams({
    establishmentProfile: { saudiCount: 4, totalCount: 17 },
    candidateNationality: 'SA',
    contractType: 'FTE',
  }));
  assert.equal(result.currentZone, ZONES.YELLOW,    'should start in YELLOW');
  assert.equal(result.projectedZone, ZONES.LOW_GREEN, 'should project to LOW_GREEN');
});

// ─────────────────────────────────────────────────────────────────────────────
// 17. Zone unchanged when no meaningful impact
// ─────────────────────────────────────────────────────────────────────────────
test('large establishment: zone unchanged when hiring non-Saudi', () => {
  // 300/400 = 75% — well above PLATINUM (50%) boundary.
  // Non-Saudi hire: 300/401 = 74.81% — still PLATINUM, no zone transition.
  // Starting exactly at 50% would cross the boundary; 75% gives clear headroom.
  const result = engine.calculateImpact(baseParams({
    establishmentProfile: { saudiCount: 300, totalCount: 400 },
    candidateNationality: 'IN',
    contractType: 'FTE',
  }));
  assert.equal(result.currentZone,   ZONES.PLATINUM, 'should start PLATINUM');
  assert.equal(result.projectedZone, ZONES.PLATINUM, 'should remain PLATINUM');
});

// ─────────────────────────────────────────────────────────────────────────────
// 18–19. Edge cases
// ─────────────────────────────────────────────────────────────────────────────
test('edge case: 0 total employees — result is valid, not NaN or error', () => {
  const result = engine.calculateImpact(baseParams({
    establishmentProfile: { saudiCount: 0, totalCount: 0 },
    candidateNationality: 'SA',
    contractType: 'FTE',
  }));
  assert.ok(!isNaN(result.saudiPercentageBefore), 'saudiPercentageBefore should not be NaN');
  assert.ok(!isNaN(result.saudiPercentageAfter),  'saudiPercentageAfter should not be NaN');
  assert.ok(result.currentZone,   'currentZone must be set');
  assert.ok(result.projectedZone, 'projectedZone must be set');
});

test('edge case: 100% Saudi establishment — hiring Saudi keeps zone', () => {
  // 20/20 = 100% → PLATINUM
  const result = engine.calculateImpact(baseParams({
    establishmentProfile: { saudiCount: 20, totalCount: 20 },
    candidateNationality: 'SA',
    contractType: 'FTE',
  }));
  assert.equal(result.currentZone,   ZONES.PLATINUM);
  assert.equal(result.projectedZone, ZONES.PLATINUM);
  assert.ok(result.saudiPercentageAfter <= 100, 'percentage must not exceed 100');
});

// ─────────────────────────────────────────────────────────────────────────────
// 20–21. Override store — append-only writes
// ─────────────────────────────────────────────────────────────────────────────
test('override store: inserted record has all required fields', () => {
  const store = InMemoryOverrideStore();
  const record = store.insert({
    tenantId:         'tenant-1',
    candidateId:      'cand-abc',
    originalParams:   { foo: 1 },
    overriddenParams: { bar: 2 },
    overriddenBy:     'admin-xyz',
    reason:           'Legitimate override reason for compliance',
    evidencePackId:   null,
  });
  assert.ok(record.id,               'id must be set');
  assert.equal(record.tenantId,      'tenant-1');
  assert.equal(record.candidateId,   'cand-abc');
  assert.equal(record.overriddenBy,  'admin-xyz');
  assert.ok(record.timestamp,        'timestamp must be set');
  assert.equal(record.evidencePackId, null);
});

test('override store: list returns only records for requested tenant', () => {
  const store = InMemoryOverrideStore();
  store.insert({ tenantId: 'A', candidateId: 'c1', originalParams: {}, overriddenParams: {}, overriddenBy: 'u1', reason: 'Reason long enough A1' });
  store.insert({ tenantId: 'B', candidateId: 'c2', originalParams: {}, overriddenParams: {}, overriddenBy: 'u2', reason: 'Reason long enough B1' });
  store.insert({ tenantId: 'A', candidateId: 'c3', originalParams: {}, overriddenParams: {}, overriddenBy: 'u3', reason: 'Reason long enough A2' });
  assert.equal(store.list('A').length, 2, 'tenant A should have 2 records');
  assert.equal(store.list('B').length, 1, 'tenant B should have 1 record');
});

// ─────────────────────────────────────────────────────────────────────────────
// 22. Policy version
// ─────────────────────────────────────────────────────────────────────────────
test('getPolicyVersion returns version string from config', () => {
  const version = engine.getPolicyVersion();
  assert.equal(typeof version, 'string', 'version must be a string');
  assert.ok(version.length > 0, 'version must be non-empty');
  assert.equal(version, policy.version, 'must match config.version field');
});

// ─────────────────────────────────────────────────────────────────────────────
// 23–25. Invalid params — error handling
// ─────────────────────────────────────────────────────────────────────────────
test('missing establishmentProfile throws an error', () => {
  assert.throws(
    () => engine.calculateImpact({ candidateNationality: 'SA', contractType: 'FTE' }),
    /establishmentProfile/,
  );
});

test('invalid contractType throws an error', () => {
  assert.throws(
    () => engine.calculateImpact(baseParams({ contractType: 'CONTRACTOR' })),
    /contractType/,
  );
});

test('saudiCount exceeding totalCount throws an error', () => {
  assert.throws(
    () => engine.calculateImpact(baseParams({
      establishmentProfile: { saudiCount: 15, totalCount: 10 },
    })),
    /saudiCount cannot exceed totalCount/,
  );
});
