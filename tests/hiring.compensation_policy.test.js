'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const {
  validateBreakdown,
  checkPolicyThresholds,
  calculateIndicativeGosi,
  generatePreOfferCompliancePreview,
  POLICY,
} = require('../app/modules/hiring/compensation_policy_service');

// ── fixtures ──────────────────────────────────────────────────────────────────

const VALID_OFFER = {
  base_salary:         10000,
  housing_allowance:   3000,   // 30% of base — above 25% minimum
  transport_allowance:  500,
};

const VALID_OFFER_WITH_TOTAL = {
  ...VALID_OFFER,
  total_compensation: 13500,   // exact sum
};

// ── validateBreakdown ─────────────────────────────────────────────────────────

describe('validateBreakdown', () => {
  test('valid when all required fields present and correct', () => {
    const r = validateBreakdown(VALID_OFFER);
    assert.equal(r.valid, true);
    assert.equal(r.computed_total, 13500);
    assert.equal(r.violations.length, 0);
  });

  test('valid when total_compensation matches computed sum', () => {
    const r = validateBreakdown(VALID_OFFER_WITH_TOTAL);
    assert.equal(r.valid, true);
  });

  test('RED violation when total_compensation does not match sum', () => {
    const r = validateBreakdown({ ...VALID_OFFER, total_compensation: 15000 });
    assert.equal(r.valid, false);
    const v = r.violations.find(v => v.code === 'breakdown_mismatch');
    assert.ok(v,                    'breakdown_mismatch violation present');
    assert.equal(v.severity, 'RED', 'mismatch is RED');
  });

  test('RED violation when base_salary is missing', () => {
    const { base_salary: _, ...noBase } = VALID_OFFER;
    const r = validateBreakdown(noBase);
    assert.equal(r.valid, false);
    assert.ok(r.violations.find(v => v.field === 'base_salary'));
  });

  test('RED violation when housing_allowance is missing', () => {
    const { housing_allowance: _, ...noHousing } = VALID_OFFER;
    const r = validateBreakdown(noHousing);
    assert.equal(r.valid, false);
    assert.ok(r.violations.find(v => v.field === 'housing_allowance'));
  });

  test('RED violation when transport_allowance is missing', () => {
    const { transport_allowance: _, ...noTransport } = VALID_OFFER;
    const r = validateBreakdown(noTransport);
    assert.equal(r.valid, false);
    assert.ok(r.violations.find(v => v.field === 'transport_allowance'));
  });

  test('accepts zero values for allowances (zero is valid)', () => {
    const r = validateBreakdown({ base_salary: 8000, housing_allowance: 0, transport_allowance: 0 });
    assert.equal(r.valid, true);
    assert.equal(r.computed_total, 8000);
  });
});

// ── checkPolicyThresholds ─────────────────────────────────────────────────────

describe('checkPolicyThresholds', () => {
  test('passes when base_salary within range for MID/RIYADH', () => {
    const r = checkPolicyThresholds(VALID_OFFER, 'MID', 'RIYADH');
    assert.equal(r.passes, true);
    assert.equal(r.violations.length, 0);
  });

  test('RED violation when base_salary below minimum', () => {
    const r = checkPolicyThresholds({ ...VALID_OFFER, base_salary: 3000 }, 'MID', 'RIYADH');
    assert.equal(r.passes, false);
    const v = r.violations.find(v => v.code === 'below_minimum_salary');
    assert.ok(v,                    'below_minimum_salary violation');
    assert.equal(v.severity, 'RED', 'below minimum is RED');
  });

  test('AMBER violation when base_salary above maximum', () => {
    const r = checkPolicyThresholds({ ...VALID_OFFER, base_salary: 30000 }, 'MID', 'RIYADH');
    const v = r.violations.find(v => v.code === 'above_maximum_salary');
    assert.ok(v,                      'above_maximum_salary violation');
    assert.equal(v.severity, 'AMBER', 'above maximum is AMBER');
  });

  test('AMBER violation when housing_allowance below 25% of base', () => {
    const r = checkPolicyThresholds({ base_salary: 10000, housing_allowance: 2000, transport_allowance: 500 }, 'MID', 'RIYADH');
    const v = r.violations.find(v => v.code === 'housing_below_minimum');
    assert.ok(v,                      'housing_below_minimum violation');
    assert.equal(v.severity, 'AMBER', 'housing warning is AMBER');
  });

  test('AMBER violation when role category is unknown', () => {
    const r = checkPolicyThresholds(VALID_OFFER, 'INTERN', 'RIYADH');
    const v = r.violations.find(v => v.code === 'unknown_role_category');
    assert.ok(v,                      'unknown_role_category violation');
    assert.equal(v.severity, 'AMBER', 'unknown category is AMBER');
  });

  test('falls back to OTHER when region is unknown', () => {
    const r = checkPolicyThresholds(VALID_OFFER, 'MID', 'DAMMAM');
    assert.ok(r.violations.find(v => v.code === 'unknown_region'), 'unknown_region AMBER present');
    // Should still evaluate with OTHER thresholds
    assert.ok(r.thresholds, 'thresholds object returned');
  });
});

// ── calculateIndicativeGosi ───────────────────────────────────────────────────

describe('calculateIndicativeGosi', () => {
  test('calculates employer and employee amounts correctly', () => {
    const r = calculateIndicativeGosi({ base_salary: 10000 });
    assert.equal(r.employer_amount, 1200);    // 10000 * 0.12
    assert.equal(r.employee_amount, 1000);    // 10000 * 0.10
    assert.equal(r.total_amount,    2200);
  });

  test('caps contribution base at policy ceiling (45000 SAR)', () => {
    const r = calculateIndicativeGosi({ base_salary: 60000 });
    assert.equal(r.contribution_base, 45000, 'contribution base capped at 45000');
    assert.equal(r.is_capped,         true,  'is_capped flag set');
    assert.equal(r.employer_amount,   5400); // 45000 * 0.12
    assert.equal(r.employee_amount,   4500); // 45000 * 0.10
  });

  test('not capped when below ceiling', () => {
    const r = calculateIndicativeGosi({ base_salary: 10000 });
    assert.equal(r.is_capped, false);
    assert.equal(r.contribution_base, 10000);
  });

  test('disclaimer is always present — never null or empty', () => {
    const r = calculateIndicativeGosi({ base_salary: 5000 });
    assert.ok(r.disclaimer,     'disclaimer object present');
    assert.ok(r.disclaimer.en,  'EN disclaimer non-empty');
    assert.ok(r.disclaimer.ar,  'AR disclaimer non-empty');
    assert.ok(r.disclaimer.en.length > 10, 'EN disclaimer is a full sentence');
    assert.ok(r.disclaimer.ar.length > 10, 'AR disclaimer is a full sentence');
  });

  test('disclaimer text matches policy config verbatim', () => {
    const r = calculateIndicativeGosi({ base_salary: 5000 });
    assert.equal(r.disclaimer.en, POLICY.gosi.disclaimer.en);
    assert.equal(r.disclaimer.ar, POLICY.gosi.disclaimer.ar);
  });
});

// ── generatePreOfferCompliancePreview ─────────────────────────────────────────

describe('generatePreOfferCompliancePreview', () => {
  test('can_send=true and no acknowledgement needed for clean offer', () => {
    const preview = generatePreOfferCompliancePreview(VALID_OFFER, 'MID', 'RIYADH');
    assert.equal(preview.can_send,                true);
    assert.equal(preview.requires_acknowledgement, false);
    assert.equal(preview.red_count,               0);
  });

  test('can_send=false when RED violations exist', () => {
    const badOffer = { base_salary: 1000, housing_allowance: 250, transport_allowance: 100 };
    const preview  = generatePreOfferCompliancePreview(badOffer, 'MID', 'RIYADH');
    assert.equal(preview.can_send, false, 'blocked by RED violation');
    assert.ok(preview.blockers.length > 0, 'blockers array populated');
    assert.ok(preview.blockers.every(b => b.severity === 'RED'), 'all blockers are RED');
  });

  test('requires_acknowledgement=true when AMBER warnings present', () => {
    // Above-maximum salary → AMBER
    const offer   = { base_salary: 30000, housing_allowance: 7500, transport_allowance: 1000 };
    const preview = generatePreOfferCompliancePreview(offer, 'MID', 'RIYADH');
    assert.equal(preview.requires_acknowledgement, true);
    assert.ok(preview.warnings.length > 0, 'warnings array populated');
    assert.ok(preview.warnings.every(w => w.severity === 'AMBER'), 'all warnings are AMBER');
  });

  test('breakdown mismatch RED blocks send', () => {
    const offer   = { base_salary: 10000, housing_allowance: 3000, transport_allowance: 500, total_compensation: 20000 };
    const preview = generatePreOfferCompliancePreview(offer, 'MID', 'RIYADH');
    assert.equal(preview.can_send, false);
    assert.ok(preview.blockers.find(b => b.code === 'breakdown_mismatch'));
  });

  test('items array contains GREEN entries for passed checks', () => {
    const preview = generatePreOfferCompliancePreview(VALID_OFFER, 'MID', 'RIYADH');
    assert.ok(preview.green_count > 0, 'green items present');
    assert.ok(preview.items.some(i => i.severity === 'GREEN'), 'at least one GREEN item');
  });

  test('policy_version present in preview result', () => {
    const preview = generatePreOfferCompliancePreview(VALID_OFFER, 'MID', 'RIYADH');
    assert.equal(preview.policy_version, POLICY.version);
  });
});

// ── POLICY config ─────────────────────────────────────────────────────────────

describe('POLICY config', () => {
  test('version is v1', () => {
    assert.equal(POLICY.version, 'v1');
  });

  test('GOSI employer rate is 12%', () => {
    assert.equal(POLICY.gosi.employerContributionRate, 0.12);
  });

  test('GOSI employee rate is 10%', () => {
    assert.equal(POLICY.gosi.employeeContributionRate, 0.10);
  });

  test('GOSI disclaimer in both EN and AR', () => {
    assert.ok(POLICY.gosi.disclaimer.en, 'EN disclaimer in config');
    assert.ok(POLICY.gosi.disclaimer.ar, 'AR disclaimer in config');
  });

  test('all violation severity codes are defined in config', () => {
    const required = ['below_minimum_salary','above_maximum_salary','breakdown_mismatch','missing_required_field','housing_below_minimum'];
    required.forEach(code => {
      assert.ok(POLICY.violationSeverity[code], `severity for ${code} defined`);
    });
  });
});
