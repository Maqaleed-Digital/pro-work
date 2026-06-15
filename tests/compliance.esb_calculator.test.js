'use strict';

/**
 * S38-G4 — ESB Calculator Service Tests
 *
 * Covers: tenure brackets, all termination reason modifiers, policy version selection,
 * evidence storage artifact, disclaimer mandatory, inputs+outputs snapshot, edge cases.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');

const {
  createEsbCalculatorService,
  computeYearsOfService,
  computeGrossEsb,
} = require('../app/modules/compliance/esb_calculator_service');

// ── helpers ───────────────────────────────────────────────────────────────────

// Build a service with both policy versions loaded
const svc = createEsbCalculatorService();

function baseParams(overrides = {}) {
  return {
    employmentStartDate: '2015-01-01',
    terminationDate:     '2025-01-01',  // exactly 10 years
    basicSalary:         10000,
    housingAllowance:    3000,
    terminationReason:   'EMPLOYER_TERMINATION',
    contractType:        'UNLIMITED',
    employeeNationality: 'Saudi',
    ...overrides,
  };
}

// ── 1. computeYearsOfService ──────────────────────────────────────────────────

describe('computeYearsOfService', () => {
  test('exact 10-year tenure returns ~10 years', () => {
    const years = computeYearsOfService('2015-01-01', '2025-01-01');
    assert.ok(Math.abs(years - 10) < 0.01, `Expected ~10, got ${years}`);
  });

  test('exact 5-year tenure returns ~5 years', () => {
    const years = computeYearsOfService('2020-01-01', '2025-01-01');
    assert.ok(Math.abs(years - 5) < 0.01, `Expected ~5, got ${years}`);
  });

  test('1-year tenure returns ~1 year', () => {
    const years = computeYearsOfService('2024-01-01', '2025-01-01');
    assert.ok(Math.abs(years - 1) < 0.01);
  });
});

// ── 2. tenure brackets (v1 policy) ───────────────────────────────────────────

describe('tenure brackets — v1 policy', () => {
  test('< 2 years EMPLOYER_TERMINATION: 0.5 months/year, no modifier reduction', () => {
    // 1.5 years × 0.5 months/year = 0.75 months × 10000 = 7500 SAR (gross = net for employer term)
    const result = svc.calculate({
      ...baseParams(),
      employmentStartDate: '2023-07-01',
      terminationDate:     '2025-01-01',  // ~1.5 years
      terminationReason:   'EMPLOYER_TERMINATION',
    }, 'v1');
    assert.ok(result.yearsOfService > 1 && result.yearsOfService < 2);
    assert.equal(result.modifier, 1.0);
    assert.ok(result.grossEsb > 0);
    assert.equal(result.grossEsb, result.netEsb);
    assert.ok(result.breakdown[0].monthsPerYear === 0.5);
  });

  test('exactly 5 years EMPLOYER_TERMINATION: 5 × 0.5 = 2.5 months = 25,000 SAR', () => {
    const result = svc.calculate({
      ...baseParams(),
      employmentStartDate: '2020-01-01',
      terminationDate:     '2025-01-01',
      terminationReason:   'EMPLOYER_TERMINATION',
    }, 'v1');
    assert.ok(Math.abs(result.yearsOfService - 5) < 0.01);
    assert.ok(Math.abs(result.grossEsb - 25000) < 200, `Expected ~25000, got ${result.grossEsb}`);  // leap-year calendar variance
    assert.equal(result.modifier, 1.0);
    assert.equal(result.grossEsb, result.netEsb);
  });

  test('7 years EMPLOYER_TERMINATION: 5×0.5 + 2×1.0 = 4.5 months = 45,000 SAR', () => {
    const result = svc.calculate({
      ...baseParams(),
      employmentStartDate: '2018-01-01',
      terminationDate:     '2025-01-01',
      terminationReason:   'EMPLOYER_TERMINATION',
    }, 'v1');
    assert.ok(Math.abs(result.yearsOfService - 7) < 0.01);
    assert.ok(Math.abs(result.grossEsb - 45000) < 50, `Expected ~45000, got ${result.grossEsb}`);
    assert.equal(result.modifier, 1.0);
  });

  test('exactly 10 years EMPLOYER_TERMINATION: 5×0.5 + 5×1.0 = 7.5 months = 75,000 SAR', () => {
    const result = svc.calculate(baseParams(), 'v1');
    assert.ok(Math.abs(result.yearsOfService - 10) < 0.01);
    assert.ok(Math.abs(result.grossEsb - 75000) < 50, `Expected ~75000, got ${result.grossEsb}`);
    assert.equal(result.modifier, 1.0);
  });

  test('20 years EMPLOYER_TERMINATION: 5×0.5 + 15×1.0 = 17.5 months = 175,000 SAR', () => {
    const result = svc.calculate({
      ...baseParams(),
      employmentStartDate: '2005-01-01',
      terminationDate:     '2025-01-01',
      terminationReason:   'EMPLOYER_TERMINATION',
    }, 'v1');
    assert.ok(Math.abs(result.yearsOfService - 20) < 0.01);
    assert.ok(Math.abs(result.grossEsb - 175000) < 50, `Expected ~175000, got ${result.grossEsb}`);
  });
});

// ── 3. termination reason modifiers ──────────────────────────────────────────

describe('termination reason modifiers — v1 policy', () => {
  test('RESIGNATION < 2 years: modifier = 0, netEsb = 0', () => {
    const result = svc.calculate({
      ...baseParams(),
      employmentStartDate: '2024-01-01',
      terminationDate:     '2025-01-01',  // 1 year
      terminationReason:   'RESIGNATION',
    }, 'v1');
    assert.equal(result.modifier, 0);
    assert.equal(result.netEsb, 0);
    assert.ok(result.grossEsb > 0, 'grossEsb should still be computed');
  });

  test('RESIGNATION 2-5 years: modifier = 0.3333', () => {
    const result = svc.calculate({
      ...baseParams(),
      employmentStartDate: '2022-01-01',
      terminationDate:     '2025-01-01',  // 3 years
      terminationReason:   'RESIGNATION',
    }, 'v1');
    assert.ok(Math.abs(result.modifier - 0.3333) < 0.001);
    assert.ok(result.netEsb > 0);
    assert.ok(result.netEsb < result.grossEsb);
  });

  test('RESIGNATION 5-10 years: modifier = 0.6667', () => {
    const result = svc.calculate({
      ...baseParams(),
      employmentStartDate: '2018-01-01',
      terminationDate:     '2025-01-01',  // 7 years
      terminationReason:   'RESIGNATION',
    }, 'v1');
    assert.ok(Math.abs(result.modifier - 0.6667) < 0.001);
    assert.ok(result.netEsb < result.grossEsb);
  });

  test('RESIGNATION ≥ 10 years: modifier = 1.0 (full entitlement)', () => {
    const result = svc.calculate({
      ...baseParams(),
      terminationReason: 'RESIGNATION',
    }, 'v1');
    assert.ok(Math.abs(result.yearsOfService - 10) < 0.01);
    assert.equal(result.modifier, 1.0);
    assert.equal(result.grossEsb, result.netEsb);
  });

  test('RETIREMENT: modifier = 1.0', () => {
    const result = svc.calculate({ ...baseParams(), terminationReason: 'RETIREMENT' }, 'v1');
    assert.equal(result.modifier, 1.0);
    assert.equal(result.grossEsb, result.netEsb);
  });

  test('DEATH: modifier = 1.0', () => {
    const result = svc.calculate({ ...baseParams(), terminationReason: 'DEATH' }, 'v1');
    assert.equal(result.modifier, 1.0);
    assert.equal(result.grossEsb, result.netEsb);
  });

  test('MUTUAL_AGREEMENT: modifier = 1.0', () => {
    const result = svc.calculate({ ...baseParams(), terminationReason: 'MUTUAL_AGREEMENT' }, 'v1');
    assert.equal(result.modifier, 1.0);
    assert.equal(result.grossEsb, result.netEsb);
  });

  test('unknown termination reason throws EsbCalculatorError', () => {
    assert.throws(
      () => svc.calculate({ ...baseParams(), terminationReason: 'FIRED_FOR_CAUSE' }, 'v1'),
      (err) => err.name === 'EsbCalculatorError',
    );
  });
});

// ── 4. policy version selection ───────────────────────────────────────────────

describe('policy version selection', () => {
  test('getPolicyVersions returns both v1 and v2', () => {
    const versions = svc.getPolicyVersions();
    const ids = versions.map(v => v.version);
    assert.ok(ids.includes('v1'));
    assert.ok(ids.includes('v2'));
  });

  test('getActivePolicyVersion returns the latest by effectiveDate', () => {
    const active = svc.getActivePolicyVersion();
    assert.equal(active, 'v2');  // v2 effectiveDate 2024 > v1 effectiveDate 2005
  });

  test('v1 vs v2 produce different netEsb for RESIGNATION 1.5 years', () => {
    const params = {
      ...baseParams(),
      employmentStartDate: '2023-07-01',
      terminationDate:     '2025-01-01',  // ~1.5 years
      terminationReason:   'RESIGNATION',
    };
    const r1 = svc.calculate(params, 'v1');
    const r2 = svc.calculate(params, 'v2');
    // v1: < 2 years RESIGNATION → modifier 0, netEsb = 0
    // v2: 1-2 years RESIGNATION → modifier 0.25, netEsb > 0
    assert.equal(r1.netEsb, 0);
    assert.ok(r2.netEsb > 0, `v2 should give >0 for 1.5y resignation, got ${r2.netEsb}`);
    assert.notEqual(r1.netEsb, r2.netEsb);
  });

  test('v2 includes housing allowance in salary basis, v1 does not', () => {
    const r1 = svc.calculate(baseParams(), 'v1');
    const r2 = svc.calculate(baseParams(), 'v2');
    // v1 uses basicSalary (10000), v2 uses basicSalary + housing (13000)
    assert.equal(r1.monthlySalary, 10000);
    assert.equal(r2.monthlySalary, 13000);
    assert.ok(r2.grossEsb > r1.grossEsb);
  });

  test('v2 applies maximumCapMonths = 24', () => {
    // 30 years of service, 10000/month → grossEsb = (5×0.5 + 25×1.0) × 13000 = 27.5 × 13000 = 357,500
    // cap = 24 × 13000 = 312,000
    const r2 = svc.calculate({
      ...baseParams(),
      employmentStartDate: '1995-01-01',
      terminationDate:     '2025-01-01',  // 30 years
      terminationReason:   'EMPLOYER_TERMINATION',
    }, 'v2');
    assert.ok(r2.cappedAt !== null, 'v2 should cap the result');
    assert.equal(r2.netEsb, r2.cappedAt);
    assert.ok(r2.grossEsb > r2.netEsb);
  });

  test('v1 does not cap (maximumCapMonths = null)', () => {
    const r1 = svc.calculate({
      ...baseParams(),
      employmentStartDate: '1995-01-01',
      terminationDate:     '2025-01-01',  // 30 years
      terminationReason:   'EMPLOYER_TERMINATION',
    }, 'v1');
    assert.equal(r1.cappedAt, null);
    assert.equal(r1.grossEsb, r1.netEsb);
  });

  test('unknown policy version throws EsbCalculatorError', () => {
    assert.throws(
      () => svc.calculate(baseParams(), 'v99'),
      (err) => err.name === 'EsbCalculatorError',
    );
  });
});

// ── 5. result structure & disclaimer ─────────────────────────────────────────

describe('result structure and mandatory disclaimer', () => {
  test('disclaimer is always present in result', () => {
    const r1 = svc.calculate(baseParams(), 'v1');
    const r2 = svc.calculate(baseParams(), 'v2');
    assert.ok(r1.disclaimer && r1.disclaimer.length > 10, 'v1 disclaimer missing');
    assert.ok(r2.disclaimer && r2.disclaimer.length > 10, 'v2 disclaimer missing');
  });

  test('inputs snapshot present in result', () => {
    const result = svc.calculate(baseParams(), 'v1');
    assert.ok(result.inputs.employmentStartDate);
    assert.ok(result.inputs.terminationDate);
    assert.equal(result.inputs.basicSalary, 10000);
    assert.equal(result.inputs.terminationReason, 'EMPLOYER_TERMINATION');
  });

  test('outputs snapshot present in result', () => {
    const result = svc.calculate(baseParams(), 'v1');
    assert.ok(typeof result.outputs.yearsOfService === 'number');
    assert.ok(typeof result.outputs.grossEsb       === 'number');
    assert.ok(typeof result.outputs.netEsb         === 'number');
    assert.ok(result.outputs.calculatedAt);
  });

  test('evidencePackData has pack_type EP_WOS_OFFBOARD_01', () => {
    const result = svc.calculate(baseParams(), 'v1');
    assert.equal(result.evidencePackData.pack_type,      'EP_WOS_OFFBOARD_01');
    assert.equal(result.evidencePackData.policy_version, 'v1');
    assert.ok(result.evidencePackData.inputs);
    assert.ok(result.evidencePackData.outputs);
    assert.ok(result.evidencePackData.disclaimer);
  });

  test('breakdown contains at least one tenure entry', () => {
    const result = svc.calculate(baseParams(), 'v1');
    assert.ok(Array.isArray(result.breakdown));
    assert.ok(result.breakdown.length > 0);
    assert.ok(typeof result.breakdown[0].monthsPerYear === 'number');
  });
});

// ── 6. storeAsEvidence ────────────────────────────────────────────────────────

describe('storeAsEvidence', () => {
  test('produces valid EP_WOS_OFFBOARD_01 pack params', () => {
    const result = svc.calculate(baseParams(), 'v1');
    const packParams = svc.storeAsEvidence(result, {
      pack_id:   'ep-esb-001',
      tenant_id: 'tenant-abc',
      actor:     { actor_id: 'hr-1', actor_name: 'HR Team', actor_role: 'HR' },
    });
    assert.equal(packParams.pack_id,   'ep-esb-001');
    assert.equal(packParams.pack_type, 'EP_WOS_OFFBOARD_01');
    assert.equal(packParams.tenant_id, 'tenant-abc');
    assert.ok(packParams.action.includes('ESB calculated'));
    assert.ok(packParams.action.includes('v1'));
    assert.ok(packParams.data_snapshot.inputs);
    assert.ok(packParams.data_snapshot.outputs);
    assert.ok(packParams.data_snapshot.disclaimer);
    assert.equal(packParams.data_snapshot.pack_type, 'EP_WOS_OFFBOARD_01');
  });

  test('storeAsEvidence + evidencePackService.create succeeds', async () => {
    const { createEvidencePackService, InMemoryEvidencePackStore } = require('../app/modules/evidence/evidence_pack_service');
    const epStore = new InMemoryEvidencePackStore();
    const epSvc   = createEvidencePackService({ store: epStore });

    const result     = svc.calculate(baseParams(), 'v1');
    const packParams = svc.storeAsEvidence(result, {
      pack_id:   'ep-esb-002',
      tenant_id: 'tenant-abc',
      actor:     { actor_id: 'hr-1', actor_name: 'HR Team', actor_role: 'HR' },
    });

    const stored = await epSvc.create(packParams);
    assert.equal(stored.pack_id,   'ep-esb-002');
    assert.equal(stored.pack_type, 'EP_WOS_OFFBOARD_01');
    assert.equal(stored.status,    'OPEN');
    assert.match(stored.immutable_hash, /^[a-f0-9]{64}$/);
  });

  test('storeAsEvidence throws when result missing', () => {
    assert.throws(
      () => svc.storeAsEvidence(null, { pack_id: 'x', tenant_id: 'y', actor: { actor_id: 'z' } }),
      (err) => err.name === 'EsbCalculatorError',
    );
  });
});
