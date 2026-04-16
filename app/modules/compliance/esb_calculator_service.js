'use strict';

const path = require('path');
const fs   = require('fs');
const crypto = require('crypto');

// ── load all versioned policies from config dir ───────────────────────────────

const CONFIG_DIR = path.join(__dirname, '../../config/compliance');

function loadPolicies() {
  const policies = {};
  const files = fs.readdirSync(CONFIG_DIR).filter(f => /^esb_policy_v\d+\.json$/.test(f));
  for (const file of files) {
    const raw = JSON.parse(fs.readFileSync(path.join(CONFIG_DIR, file), 'utf8'));
    policies[raw.version] = raw;
  }
  return policies;
}

const _POLICIES = loadPolicies();

// ── helpers ───────────────────────────────────────────────────────────────────

function assert(condition, message) {
  if (!condition) {
    const err = new Error(message);
    err.name = 'EsbCalculatorError';
    throw err;
  }
}

/**
 * computeYearsOfService — returns exact decimal years between two ISO date strings.
 * Uses calendar-based calculation: days / 365.25
 */
function computeYearsOfService(startDate, endDate) {
  const ms = new Date(endDate).getTime() - new Date(startDate).getTime();
  return ms / (365.25 * 24 * 60 * 60 * 1000);
}

/**
 * computeGrossEsb — applies tenure brackets to compute the raw ESB entitlement
 * (pre-modifier), expressed as a number-of-months multiplier × monthly salary.
 *
 * The brackets are applied proportionally: if an employee has 7.5 years,
 * the first 5 years apply at 0.5 months/year, and the remaining 2.5 at 1.0 months/year.
 *
 * @param {number} yearsOfService — decimal years
 * @param {number} monthlySalary  — monthly salary (basis per policy)
 * @param {Array}  brackets       — policy.tenureBrackets
 * @returns {{ totalMonths: number, breakdown: Array, grossEsb: number }}
 */
function computeGrossEsb(yearsOfService, monthlySalary, brackets) {
  const breakdown = [];
  let totalMonths = 0;
  let remainingYears = yearsOfService;

  for (const bracket of brackets) {
    if (remainingYears <= 0) break;

    const bracketMax = bracket.toYearsExclusive !== null
      ? bracket.toYearsExclusive - bracket.fromYearsInclusive
      : Infinity;

    const yearsInBracket = Math.min(remainingYears, bracketMax);
    const monthsForBracket = yearsInBracket * bracket.monthsPerYear;

    breakdown.push({
      fromYear:        bracket.fromYearsInclusive,
      toYear:          bracket.toYearsExclusive,
      yearsApplied:    round4(yearsInBracket),
      monthsPerYear:   bracket.monthsPerYear,
      monthsEarned:    round4(monthsForBracket),
      label:           bracket.label,
    });

    totalMonths    += monthsForBracket;
    remainingYears -= yearsInBracket;
  }

  return {
    totalMonths: round4(totalMonths),
    grossEsb:    round2(totalMonths * monthlySalary),
    breakdown,
  };
}

/**
 * resolveModifier — gets the modifier for a termination reason,
 * handling tenure-dependent RESIGNATION modifiers.
 */
function resolveModifier(terminationReason, yearsOfService, policy) {
  const rule = policy.terminationReasonRules[terminationReason];
  assert(rule, `Unknown termination reason: ${terminationReason}. Valid: ${Object.keys(policy.terminationReasonRules).join(', ')}`);

  if (typeof rule.modifier === 'number') {
    return { modifier: rule.modifier, modifierLabel: rule.label };
  }

  // tenure-based modifiers (RESIGNATION)
  assert(Array.isArray(rule.tenureModifiers), `Policy error: ${terminationReason} expects tenureModifiers array`);
  for (const tm of rule.tenureModifiers) {
    const inBracket =
      yearsOfService >= tm.fromYearsInclusive &&
      (tm.toYearsExclusive === null || yearsOfService < tm.toYearsExclusive);
    if (inBracket) {
      return { modifier: tm.modifier, modifierLabel: tm.label };
    }
  }

  // fallback: no match → 0
  return { modifier: 0, modifierLabel: 'No matching tenure bracket' };
}

function round2(n) { return Math.round(n * 100) / 100; }
function round4(n) { return Math.round(n * 10000) / 10000; }

// ── service factory ───────────────────────────────────────────────────────────

/**
 * createEsbCalculatorService({ policies? })
 *
 * Methods:
 *   calculate(params, policyVersion)    — compute ESB with full breakdown
 *   getPolicyVersions()                 — list available policy versions
 *   getActivePolicyVersion()            — returns latest effective version
 *   storeAsEvidence(result, packMeta)   — builds EP_WOS_OFFBOARD_01 compatible artifact
 */
function createEsbCalculatorService({ policies } = {}) {
  const _policies = policies || _POLICIES;
  assert(Object.keys(_policies).length > 0, 'No ESB policies loaded');

  function getPolicyVersions() {
    return Object.values(_policies).map(p => ({
      version:       p.version,
      effectiveDate: p.effectiveDate,
      description:   p.description,
      legalReference: p.legalReference,
    })).sort((a, b) => a.version.localeCompare(b.version));
  }

  function getActivePolicyVersion() {
    const versions = getPolicyVersions();
    // Latest by effectiveDate
    return versions.sort((a, b) => b.effectiveDate.localeCompare(a.effectiveDate))[0].version;
  }

  /**
   * calculate(params, policyVersion?)
   *
   * params:
   *   employmentStartDate  ISO string
   *   terminationDate      ISO string
   *   basicSalary          number (monthly)
   *   housingAllowance     number (monthly, default 0)
   *   terminationReason    string — key in policy.terminationReasonRules
   *   contractType         string (informational, stored in evidence)
   *   employeeNationality  string (informational, stored in evidence)
   *
   * Returns ESBCalculationResult:
   *   {
   *     calculationId, policyVersion, disclaimer,
   *     inputs (snapshot), outputs (snapshot),
   *     grossEsb, netEsb, modifier, modifierLabel,
   *     yearsOfService, monthlySalary, monthsEarned,
   *     breakdown, evidencePackData
   *   }
   */
  function calculate(params, policyVersion) {
    assert(params && typeof params === 'object', 'params is required');
    assert(params.employmentStartDate, 'params.employmentStartDate is required');
    assert(params.terminationDate,     'params.terminationDate is required');
    assert(typeof params.basicSalary === 'number' && params.basicSalary >= 0, 'params.basicSalary must be a non-negative number');
    assert(params.terminationReason,   'params.terminationReason is required');

    const version = policyVersion || getActivePolicyVersion();
    const policy  = _policies[version];
    assert(policy, `Policy version not found: ${version}. Available: ${Object.keys(_policies).join(', ')}`);

    const housingAllowance = typeof params.housingAllowance === 'number' ? params.housingAllowance : 0;

    // Salary basis per policy
    let monthlySalary = params.basicSalary;
    if (Array.isArray(policy.salaryBasis) && policy.salaryBasis.includes('housing')) {
      monthlySalary += housingAllowance;
    }

    const yearsOfService = computeYearsOfService(params.employmentStartDate, params.terminationDate);
    assert(yearsOfService >= 0, 'terminationDate must be after employmentStartDate');

    const { totalMonths, grossEsb, breakdown } = computeGrossEsb(yearsOfService, monthlySalary, policy.tenureBrackets);
    const { modifier, modifierLabel } = resolveModifier(params.terminationReason, yearsOfService, policy);

    let netEsb = round2(grossEsb * modifier);

    // Apply maximum cap if policy specifies one
    let cappedAt = null;
    if (policy.maximumCapMonths !== null && typeof policy.maximumCapMonths === 'number') {
      const cap = round2(monthlySalary * policy.maximumCapMonths);
      if (netEsb > cap) {
        cappedAt = cap;
        netEsb   = cap;
      }
    }

    const calculationId = crypto.randomUUID();
    const calculatedAt  = new Date().toISOString();

    const inputs = {
      employmentStartDate: params.employmentStartDate,
      terminationDate:     params.terminationDate,
      basicSalary:         params.basicSalary,
      housingAllowance,
      terminationReason:   params.terminationReason,
      contractType:        params.contractType        || null,
      employeeNationality: params.employeeNationality || null,
      policyVersion:       version,
    };

    const outputs = {
      yearsOfService:  round4(yearsOfService),
      monthlySalary,
      monthsEarned:    totalMonths,
      grossEsb,
      modifier,
      modifierLabel,
      netEsb,
      cappedAt,
      calculatedAt,
    };

    // Evidence pack data — EP_WOS_OFFBOARD_01 compatible
    const evidencePackData = {
      pack_type:        'EP_WOS_OFFBOARD_01',
      calculator_id:    'esb_calculator',
      calculation_id:   calculationId,
      policy_version:   version,
      legal_reference:  policy.legalReference,
      inputs,
      outputs,
      breakdown,
      disclaimer:       policy.disclaimer,
    };

    return {
      calculationId,
      policyVersion:  version,
      disclaimer:     policy.disclaimer,
      inputs,
      outputs,
      grossEsb,
      netEsb,
      modifier,
      modifierLabel,
      yearsOfService:  round4(yearsOfService),
      monthlySalary,
      monthsEarned:    totalMonths,
      cappedAt,
      breakdown,
      evidencePackData,
      calculatedAt,
    };
  }

  /**
   * storeAsEvidence(result, packMeta) — builds a complete EP_WOS_OFFBOARD_01 pack params
   * object ready for evidencePackService.create().
   *
   * packMeta: { pack_id, tenant_id, actor, approval_chain? }
   */
  function storeAsEvidence(result, packMeta) {
    assert(result && result.calculationId, 'result from calculate() is required');
    assert(packMeta && packMeta.pack_id,   'packMeta.pack_id is required');
    assert(packMeta.tenant_id,             'packMeta.tenant_id is required');
    assert(packMeta.actor && packMeta.actor.actor_id, 'packMeta.actor.actor_id is required');

    return {
      pack_id:         packMeta.pack_id,
      pack_type:       'EP_WOS_OFFBOARD_01',
      tenant_id:       packMeta.tenant_id,
      actor:           packMeta.actor,
      action:          `ESB calculated: ${result.netEsb} SAR (policy ${result.policyVersion}, ${result.yearsOfService} years, ${result.inputs.terminationReason})`,
      timestamp:       result.calculatedAt,
      data_snapshot:   result.evidencePackData,
      attached_files:  [],
      approval_chain:  packMeta.approval_chain || [],
      ai_artifacts:    [],
      redaction_rules: [],
    };
  }

  return {
    calculate,
    getPolicyVersions,
    getActivePolicyVersion,
    storeAsEvidence,
    // Exposed for testing
    _policies,
  };
}

module.exports = {
  createEsbCalculatorService,
  computeYearsOfService,
  computeGrossEsb,
};
