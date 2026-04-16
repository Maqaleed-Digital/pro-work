'use strict';

const path = require('path');
const fs   = require('fs');

const POLICY = JSON.parse(
  fs.readFileSync(
    path.join(__dirname, '../../config/compliance/compensation_policy_v1.json'),
    'utf8'
  )
);

const GOSI_EMP_RATE   = POLICY.gosi.employerContributionRate;
const GOSI_EE_RATE    = POLICY.gosi.employeeContributionRate;
const GOSI_CAP        = POLICY.gosi.monthlyContributionCap;
const THRESHOLDS      = POLICY.thresholds;
const HOUSING_RULES   = POLICY.housingAllowanceRules;
const SEVERITY        = POLICY.violationSeverity;
const TOLERANCE       = POLICY.breakdown.totalToleranceSAR;

// ── helpers ───────────────────────────────────────────────────────────────────

function policyError(message) {
  const err = new Error(message);
  err.name = 'CompensationPolicyError';
  return err;
}

function assert(condition, message) {
  if (!condition) throw policyError(message);
}

function violation(code, field, messageFn) {
  const severity = SEVERITY[code] || 'AMBER';
  return { code, severity, field: field || null, message: messageFn(severity) };
}

// ── validateBreakdown ─────────────────────────────────────────────────────────

/**
 * validateBreakdown — enforces structured compensation breakdown.
 * Required: base_salary, housing_allowance, transport_allowance (all numeric).
 * If total_compensation is supplied, verifies it equals the sum (within tolerance).
 */
function validateBreakdown(offer) {
  assert(offer && typeof offer === 'object', 'offer is required');

  const violations = [];

  // Required field presence
  for (const field of POLICY.breakdown.requiredFields) {
    if (offer[field] == null) {
      violations.push(violation('missing_required_field', field,
        () => `${field} is required for compensation breakdown`));
    } else if (typeof offer[field] !== 'number' || offer[field] < 0) {
      violations.push(violation('missing_required_field', field,
        () => `${field} must be a non-negative number`));
    }
  }

  // Stop here if required fields missing
  if (violations.length > 0) {
    return { valid: false, violations };
  }

  const computedTotal = offer.base_salary + offer.housing_allowance + offer.transport_allowance;

  // Validate total_compensation if provided
  if (offer.total_compensation != null) {
    const diff = Math.abs(offer.total_compensation - computedTotal);
    if (diff > TOLERANCE) {
      violations.push(violation('breakdown_mismatch', 'total_compensation',
        () => `total_compensation (${offer.total_compensation}) does not match ` +
              `base_salary + housing_allowance + transport_allowance (${computedTotal}). ` +
              `Difference: ${diff.toFixed(2)} SAR`));
    }
  }

  return {
    valid:          violations.length === 0,
    computed_total: computedTotal,
    violations,
  };
}

// ── checkPolicyThresholds ─────────────────────────────────────────────────────

/**
 * checkPolicyThresholds — checks offer against configurable min/max thresholds.
 * roleCategory: JUNIOR | MID | SENIOR | EXECUTIVE
 * region:       RIYADH | JEDDAH | OTHER
 */
function checkPolicyThresholds(offer, roleCategory, region) {
  assert(offer && typeof offer === 'object', 'offer is required');

  const violations = [];
  const normalCategory = String(roleCategory || '').toUpperCase();
  const normalRegion   = String(region        || '').toUpperCase();

  const categoryThresholds = THRESHOLDS[normalCategory];
  if (!categoryThresholds) {
    violations.push(violation('unknown_role_category', 'role_category',
      () => `Unknown role category: "${roleCategory}". Valid: ${Object.keys(THRESHOLDS).join(', ')}`));
    return { passes: false, violations };
  }

  const regionThresholds = categoryThresholds[normalRegion] || categoryThresholds['OTHER'];
  if (!categoryThresholds[normalRegion]) {
    violations.push(violation('unknown_region', 'region',
      () => `Unknown region "${region}" — using OTHER thresholds`));
  }

  const base = offer.base_salary;
  if (base != null) {
    if (base < regionThresholds.minBaseSalary) {
      violations.push(violation('below_minimum_salary', 'base_salary',
        () => `base_salary ${base} SAR is below the minimum of ` +
              `${regionThresholds.minBaseSalary} SAR for ${normalCategory}/${normalRegion || 'OTHER'}`));
    } else if (base > regionThresholds.maxBaseSalary) {
      violations.push(violation('above_maximum_salary', 'base_salary',
        () => `base_salary ${base} SAR exceeds the recommended maximum of ` +
              `${regionThresholds.maxBaseSalary} SAR for ${normalCategory}/${normalRegion || 'OTHER'}`));
    }

    // Housing allowance minimum check
    if (offer.housing_allowance != null) {
      const minHousing = base * HOUSING_RULES.minimumPercentOfBase;
      if (offer.housing_allowance < minHousing) {
        violations.push(violation('housing_below_minimum', 'housing_allowance',
          () => `housing_allowance ${offer.housing_allowance} SAR is below recommended minimum ` +
                `of ${minHousing.toFixed(0)} SAR (${HOUSING_RULES.minimumPercentOfBase * 100}% of base)`));
      }
    }
  }

  const redViolations = violations.filter(v => v.severity === 'RED');
  return {
    passes:    violations.length === 0,
    violations,
    thresholds: regionThresholds,
  };
}

// ── calculateIndicativeGosi ───────────────────────────────────────────────────

/**
 * calculateIndicativeGosi — GOSI contribution estimates.
 * DISCLAIMER IS MANDATORY AND ALWAYS RETURNED — never suppress.
 */
function calculateIndicativeGosi(offer) {
  assert(offer && typeof offer === 'object', 'offer is required');
  assert(offer.base_salary != null && offer.base_salary >= 0, 'base_salary is required');

  const contributionBase = Math.min(offer.base_salary, GOSI_CAP);
  const employerAmount   = +(contributionBase * GOSI_EMP_RATE).toFixed(2);
  const employeeAmount   = +(contributionBase * GOSI_EE_RATE).toFixed(2);
  const totalAmount      = +(employerAmount + employeeAmount).toFixed(2);
  const isCapped         = offer.base_salary > GOSI_CAP;

  return {
    contribution_base:   contributionBase,
    employer_amount:     employerAmount,
    employee_amount:     employeeAmount,
    total_amount:        totalAmount,
    is_capped:           isCapped,
    cap_applied:         GOSI_CAP,
    employer_rate:       GOSI_EMP_RATE,
    employee_rate:       GOSI_EE_RATE,
    policy_version:      POLICY.version,
    // Disclaimer is MANDATORY — must be visible at all times, never hidden
    disclaimer: {
      en: POLICY.gosi.disclaimer.en,
      ar: POLICY.gosi.disclaimer.ar,
    },
  };
}

// ── generatePreOfferCompliancePreview ─────────────────────────────────────────

/**
 * generatePreOfferCompliancePreview — full pre-flight compliance check.
 * Returns can_send, requires_acknowledgement, and categorised items.
 *
 * RED violations  → blocks send entirely
 * AMBER warnings  → can proceed only with explicit HR acknowledgement
 * GREEN checks    → passed
 */
function generatePreOfferCompliancePreview(offer, roleCategory, region) {
  assert(offer && typeof offer === 'object', 'offer is required');

  const items = [];

  // Run breakdown validation
  const breakdown = validateBreakdown(offer);
  if (breakdown.violations.length === 0) {
    items.push({ code: 'breakdown_valid', severity: 'GREEN', message: 'Compensation breakdown is valid' });
  } else {
    items.push(...breakdown.violations);
  }

  // Run policy threshold check (only if roleCategory provided)
  if (roleCategory) {
    const threshold = checkPolicyThresholds(offer, roleCategory, region);
    if (threshold.violations.length === 0) {
      items.push({ code: 'thresholds_passed', severity: 'GREEN', message: `Policy thresholds passed for ${roleCategory}/${region || 'OTHER'}` });
    } else {
      items.push(...threshold.violations);
    }
  }

  // GOSI presence check
  if (offer.base_salary != null) {
    items.push({ code: 'gosi_calculable', severity: 'GREEN', message: 'GOSI indicative contributions calculable' });
  }

  const redItems    = items.filter(i => i.severity === 'RED');
  const amberItems  = items.filter(i => i.severity === 'AMBER');
  const greenItems  = items.filter(i => i.severity === 'GREEN');

  return {
    can_send:                  redItems.length === 0,
    requires_acknowledgement:  amberItems.length > 0,
    items,
    red_count:    redItems.length,
    amber_count:  amberItems.length,
    green_count:  greenItems.length,
    blockers:     redItems,
    warnings:     amberItems,
    policy_version: POLICY.version,
  };
}

module.exports = {
  validateBreakdown,
  checkPolicyThresholds,
  calculateIndicativeGosi,
  generatePreOfferCompliancePreview,
  POLICY,
};
