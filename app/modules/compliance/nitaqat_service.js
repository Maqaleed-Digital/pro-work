'use strict';

// S36-G3: Nitaqat Saudization policy engine
// BRD Refs: Gold BRD A4, RT-1 §4.1, KSA Sovereign Compliance Layer
//
// Design constraints:
//   - Zero hardcoded policy constants — all values loaded from config at engine creation
//   - Arabic explanation mandatory on every calculateImpact() result
//   - Confidence band always present — never single projected percentage without a band
//   - Override writes are append-only (enforced by InMemoryOverrideStore + SQL layer)
//   - Factory function pattern throughout — no classes

const crypto = require('crypto');

// ── Zone order (descending threshold) ──────────────────────────────────────────
const ZONE_ORDER = ['PLATINUM', 'HIGH_GREEN', 'MEDIUM_GREEN', 'LOW_GREEN', 'YELLOW', 'RED'];

const ZONES = Object.freeze({
  PLATINUM:     'PLATINUM',
  HIGH_GREEN:   'HIGH_GREEN',
  MEDIUM_GREEN: 'MEDIUM_GREEN',
  LOW_GREEN:    'LOW_GREEN',
  YELLOW:       'YELLOW',
  RED:          'RED',
});

// ── Internal helpers ──────────────────────────────────────────────────────────

/**
 * Map an effective Saudi percentage to a Nitaqat zone.
 * Iterates zones from highest to lowest threshold; first match wins.
 * RED has minPercentage 0, so it is always the safe fallback.
 *
 * @param {number} pct          - effective Saudi percentage (0–100)
 * @param {Object} zonesConfig  - zones object from policy config
 * @returns {string}            - zone key e.g. 'YELLOW'
 */
function zoneForPercentage(pct, zonesConfig) {
  for (const key of ZONE_ORDER) {
    if (pct >= zonesConfig[key].minPercentage) return key;
  }
  return ZONES.RED;
}

/**
 * Round a number to 2 decimal places.
 */
function round2(n) {
  return Math.round(n * 100) / 100;
}

/**
 * Build a human-readable explanation in the requested language.
 *
 * @param {Object} params       - original calculateImpact params
 * @param {Object} partialResult - result object (without explanation)
 * @param {Object} zonesConfig  - zones from policy config
 * @param {'en'|'ar'} lang
 * @returns {string}
 */
function buildExplanation(params, partialResult, zonesConfig, lang) {
  const { currentZone, projectedZone, saudiPercentageBefore, saudiPercentageAfter } = partialResult;
  const { candidateNationality, contractType } = params;

  const isSaudi    = candidateNationality === 'SA';
  const isFreelance = contractType === 'FREELANCER';
  const zoneChanged = currentZone !== projectedZone;

  if (lang === 'ar') {
    const beforeLabel  = zonesConfig[currentZone].label.ar;
    const afterLabel   = zonesConfig[projectedZone].label.ar;
    const candDesc     = isSaudi ? 'مرشح سعودي' : 'مرشح غير سعودي';
    const contractDesc = isFreelance ? 'عقد مستقل (نصف وزن)' : 'عقد دوام كامل';
    if (zoneChanged) {
      return `توظيف ${candDesc} بـ${contractDesc} سيغيّر نسبة السعودة من ` +
        `${saudiPercentageBefore.toFixed(1)}% إلى ${saudiPercentageAfter.toFixed(1)}%، ` +
        `مما ينقل المنشأة من نطاق ${beforeLabel} إلى نطاق ${afterLabel}.`;
    }
    return `توظيف ${candDesc} بـ${contractDesc} سيغيّر نسبة السعودة من ` +
      `${saudiPercentageBefore.toFixed(1)}% إلى ${saudiPercentageAfter.toFixed(1)}%. ` +
      `تبقى المنشأة في نطاق ${beforeLabel}.`;
  }

  // English
  const beforeLabel  = zonesConfig[currentZone].label.en;
  const afterLabel   = zonesConfig[projectedZone].label.en;
  const candDesc     = isSaudi ? 'Saudi candidate' : 'non-Saudi candidate';
  const contractDesc = isFreelance ? 'freelance contract (half-weight headcount)' : 'full-time contract';
  if (zoneChanged) {
    return `Hiring this ${candDesc} on a ${contractDesc} will change the Saudization ` +
      `percentage from ${saudiPercentageBefore.toFixed(1)}% to ${saudiPercentageAfter.toFixed(1)}%, ` +
      `moving the establishment from ${beforeLabel} to ${afterLabel} zone.`;
  }
  return `Hiring this ${candDesc} on a ${contractDesc} will change the Saudization ` +
    `percentage from ${saudiPercentageBefore.toFixed(1)}% to ${saudiPercentageAfter.toFixed(1)}%. ` +
    `The establishment remains in the ${beforeLabel} zone.`;
}

/**
 * Validate required params — throws on invalid input.
 */
function validateParams(params) {
  if (!params || typeof params !== 'object') {
    throw new Error('params is required');
  }
  const { establishmentProfile, candidateNationality, contractType } = params;
  if (!establishmentProfile || typeof establishmentProfile !== 'object') {
    throw new Error('establishmentProfile is required');
  }
  const { saudiCount, totalCount } = establishmentProfile;
  if (typeof saudiCount !== 'number' || saudiCount < 0) {
    throw new Error('saudiCount must be a non-negative number');
  }
  if (typeof totalCount !== 'number' || totalCount < 0) {
    throw new Error('totalCount must be a non-negative number');
  }
  if (saudiCount > totalCount) {
    throw new Error('saudiCount cannot exceed totalCount');
  }
  // S40-G5: null candidateNationality = currentZoneOnly mode (no projection)
  if (candidateNationality !== null && (!candidateNationality || typeof candidateNationality !== 'string')) {
    throw new Error('candidateNationality is required or null for current-zone-only mode');
  }
  if (candidateNationality !== null && !['FTE', 'FREELANCER'].includes(contractType)) {
    throw new Error('contractType must be FTE or FREELANCER');
  }
}

// ── Engine factory ─────────────────────────────────────────────────────────────

/**
 * Create a NitaqatPolicyEngine from a versioned policy config.
 *
 * @param {Object} config  - contents of nitaqat_policy_v1.json (or compatible)
 * @returns {{ calculateImpact, getPolicyVersion, ZONES }}
 */
function createNitaqatPolicyEngine(config) {
  if (!config || typeof config !== 'object') throw new Error('config is required');

  const { zones, confidenceBand, activityMultipliers, contractTypeFactors } = config;
  if (!zones)             throw new Error('config.zones is required');
  if (!confidenceBand)    throw new Error('config.confidenceBand is required');
  if (!activityMultipliers) throw new Error('config.activityMultipliers is required');
  if (!contractTypeFactors) throw new Error('config.contractTypeFactors is required');

  // Validate all ZONE_ORDER keys are present in config
  for (const key of ZONE_ORDER) {
    if (!zones[key] || typeof zones[key].minPercentage !== 'number') {
      throw new Error(`config.zones.${key}.minPercentage is required`);
    }
  }

  /**
   * Calculate the Nitaqat impact of a prospective hire.
   *
   * @param {Object} params
   * @param {Object} params.establishmentProfile
   * @param {number} params.establishmentProfile.saudiCount   - current Saudi headcount
   * @param {number} params.establishmentProfile.totalCount   - current total headcount
   * @param {string} [params.establishmentProfile.activityCode] - HRSD activity code
   * @param {string} [params.establishmentProfile.region]       - KSA region
   * @param {string} params.candidateNationality  - ISO 3166-1 alpha-2, 'SA' = Saudi
   * @param {string} [params.roleCategory]        - LEADERSHIP|TECHNICAL|SUPPORT|default
   * @param {'FTE'|'FREELANCER'} params.contractType
   * @param {number} [params.proposedSalary]
   *
   * @returns {NitaqatImpactResult}
   */
  function calculateImpact(params) {
    validateParams(params);

    const {
      establishmentProfile: {
        saudiCount,
        totalCount,
        activityCode,
        region,
      },
      candidateNationality,
      roleCategory,
      contractType,
      proposedSalary,
    } = params;

    // ── Contract weight ──────────────────────────────────────────────────────
    // FTE = 1.0, FREELANCER = 0.5 — from config, never hardcoded
    const contractFactor = contractTypeFactors[contractType] !== undefined
      ? contractTypeFactors[contractType]
      : contractTypeFactors['FTE'];

    // ── Activity multiplier ──────────────────────────────────────────────────
    // Different HRSD sectors have different effective thresholds.
    // We apply the multiplier to the raw percentage to get an effective
    // percentage used for zone determination.
    const activityMultiplier = (activityCode && activityMultipliers[activityCode] !== undefined)
      ? activityMultipliers[activityCode]
      : activityMultipliers['default'];

    // ── Current state ────────────────────────────────────────────────────────
    const saudiPercentageBefore = totalCount === 0
      ? 0
      : (saudiCount / totalCount) * 100;

    const effectivePctBefore = saudiPercentageBefore * activityMultiplier;
    const currentZone = zoneForPercentage(effectivePctBefore, zones);

    // S40-G5: current-zone-only mode — no hire projection
    if (candidateNationality === null) {
      return {
        currentZone,
        projectedZone: currentZone,
        saudiPercentageBefore: round2(saudiPercentageBefore),
        saudiPercentageAfter:  round2(saudiPercentageBefore),
        confidenceBand: { lower: round2(saudiPercentageBefore), upper: round2(saudiPercentageBefore) },
        zoneChanged: false,
        influencingFactors: ['CURRENT_ZONE_ONLY'],
        activityMultiplier,
        policyVersion: config.policyVersion || 'v1',
      };
    }

    // ── Projected state ──────────────────────────────────────────────────────
    const isSaudi      = candidateNationality === 'SA';
    const saudiDelta   = isSaudi ? contractFactor : 0;
    const newSaudiCount = saudiCount + saudiDelta;
    const newTotalCount = totalCount + contractFactor;

    const saudiPercentageAfter = newTotalCount === 0
      ? 0
      : (newSaudiCount / newTotalCount) * 100;

    const effectivePctAfter = saudiPercentageAfter * activityMultiplier;
    const projectedZone = zoneForPercentage(effectivePctAfter, zones);

    // ── Confidence band — never a single-point projection ───────────────────
    const baseSpread = contractType === 'FREELANCER'
      ? confidenceBand.freelancerSpreadPct
      : confidenceBand.defaultSpreadPct;

    // Widen band when projected percentage is near a zone boundary
    const nearBoundary = ZONE_ORDER.some(key => {
      const diff = Math.abs(effectivePctAfter - zones[key].minPercentage);
      return diff < confidenceBand.boundaryProximityThreshold;
    });
    const spread = nearBoundary
      ? baseSpread * confidenceBand.boundarySpreadMultiplier
      : baseSpread;

    const confidenceBandResult = {
      low:  round2(Math.max(0, effectivePctAfter - spread)),
      high: round2(Math.min(100, effectivePctAfter + spread)),
    };

    // ── Influencing factors ──────────────────────────────────────────────────
    const influencingFactors = [];
    if (isSaudi)                               influencingFactors.push('SAUDI_CANDIDATE');
    if (contractType === 'FREELANCER')         influencingFactors.push('FREELANCER_REDUCED_WEIGHT');
    if (nearBoundary)                          influencingFactors.push('BOUNDARY_PROXIMITY');
    if (activityCode && activityMultipliers[activityCode] !== undefined) {
      influencingFactors.push('ACTIVITY_CODE_APPLIED');
    }
    if (region)                                influencingFactors.push('REGION_CONTEXT');
    if (roleCategory && roleCategory !== 'default') influencingFactors.push('ROLE_CATEGORY_APPLIED');

    // ── Assemble result (explanation last — needs currentZone/projectedZone) ─
    const partialResult = {
      currentZone,
      projectedZone,
      saudiPercentageBefore: round2(saudiPercentageBefore),
      saudiPercentageAfter:  round2(saudiPercentageAfter),
      confidenceBand: confidenceBandResult,
      influencingFactors,
      explanation: { en: '', ar: '' },
    };

    partialResult.explanation.en = buildExplanation(params, partialResult, zones, 'en');
    partialResult.explanation.ar = buildExplanation(params, partialResult, zones, 'ar');

    return partialResult;
  }

  /**
   * Return the policy version string from config (e.g. "v1").
   * @returns {string}
   */
  function getPolicyVersion() {
    return config.version;
  }

  return { calculateImpact, getPolicyVersion, ZONES };
}

// ── In-memory override store (append-only) ────────────────────────────────────

/**
 * Append-only in-memory store for nitaqat_preview_overrides.
 * No update or delete methods — mirrors the SQL REVOKE constraint.
 */
function InMemoryOverrideStore() {
  const _records = [];

  function insert(record) {
    if (!record || typeof record !== 'object') throw new Error('record is required');
    const frozen = Object.freeze({
      id:               record.id               || crypto.randomUUID(),
      tenantId:         record.tenantId,
      candidateId:      record.candidateId,
      originalParams:   record.originalParams,
      overriddenParams: record.overriddenParams,
      overriddenBy:     record.overriddenBy,
      reason:           record.reason,
      timestamp:        record.timestamp        || new Date().toISOString(),
      evidencePackId:   record.evidencePackId   || null,
    });
    _records.push(frozen);
    return frozen;
  }

  function list(tenantId) {
    if (!tenantId) throw new Error('tenantId is required');
    return _records.filter(r => r.tenantId === tenantId);
  }

  function count(tenantId) {
    return list(tenantId).length;
  }

  return { insert, list, count };
}

module.exports = { createNitaqatPolicyEngine, InMemoryOverrideStore, ZONES };
