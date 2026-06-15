'use strict';

const path = require('path');
const fs   = require('fs');

const POLICY = JSON.parse(
  fs.readFileSync(
    path.join(__dirname, '../../config/compliance/compliance_risk_policy_v1.json'),
    'utf8'
  )
);

const SCORING      = POLICY.scoring;
const PROB_POLICY  = POLICY.probation;
const DOC_POLICY   = POLICY.documentation;
const WPS_POLICY   = POLICY.wps;

// ── helpers ───────────────────────────────────────────────────────────────────

function complianceError(message) {
  const err = new Error(message);
  err.name = 'ComplianceRiskError';
  return err;
}

function assert(condition, message) {
  if (!condition) throw complianceError(message);
}

function nowIso() { return new Date().toISOString(); }

function daysBetween(isoA, isoB) {
  const msPerDay = 1000 * 60 * 60 * 24;
  return Math.floor((new Date(isoB) - new Date(isoA)) / msPerDay);
}

function addDays(isoDate, days) {
  const d = new Date(isoDate);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString();
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

// ── score color band ──────────────────────────────────────────────────────────

/**
 * scoreColor — returns 'GREEN' | 'AMBER' | 'RED' for a 0–100 score.
 */
function scoreColor(score) {
  if (score === null || score === undefined) return 'RED';
  if (score >= SCORING.colorBands.green) return 'GREEN';
  if (score >= SCORING.colorBands.amber) return 'AMBER';
  return 'RED';
}

// ── component scorers ─────────────────────────────────────────────────────────

/**
 * computeNitaqatScore — maps zone name to a 0–100 score.
 * Returns { score, zone, saudization_pct, trend, color }.
 */
function computeNitaqatScore(zoneData) {
  if (!zoneData || !zoneData.zone) {
    return { score: SCORING.insufficientDataScore, zone: 'UNKNOWN', saudization_pct: null, trend: null, color: 'RED', insufficient_data: true };
  }
  const zone  = (zoneData.zone || 'UNKNOWN').toUpperCase();
  const score = POLICY.nitaqat.zoneScores[zone] ?? POLICY.nitaqat.zoneScores.UNKNOWN;
  return { score, zone, saudization_pct: zoneData.saudization_pct ?? null, trend: zoneData.trend ?? null, color: scoreColor(score) };
}

/**
 * computeWpsScore — % of tenant WPS packs that have all required steps completed.
 * Returns { score, total_packs, complete_packs, failed_packs, pending_packs, rows, color }.
 */
function computeWpsScore(tenantId, allPacks, now) {
  const nowDate = now || nowIso();
  const packs   = allPacks.filter(p => p.tenant_id === tenantId);

  if (packs.length === 0) {
    return { score: SCORING.insufficientDataScore, total_packs: 0, complete_packs: 0, failed_packs: 0, pending_packs: 0, rows: [], color: 'RED', insufficient_data: true };
  }

  const rows = packs.map(pack => {
    const completedStepIds = new Set((pack.evidence_pack?.steps || []).map(s => s.stepId));
    const allComplete = WPS_POLICY.requiredSteps.every(sid => completedStepIds.has(sid));
    const anyFailed   = pack.iban_status === 'FAILED' ||
                        pack.identity_verification_status === 'FAILED' ||
                        pack.bank_confirmation_status === 'FAILED';

    let status = 'PENDING';
    if (anyFailed)     status = 'FAILED';
    else if (allComplete) status = 'COMPLETE';
    else {
      // Amber if pending > threshold days
      const ageDays = daysBetween(pack.generated_at, nowDate);
      if (ageDays >= WPS_POLICY.pendingAgeDaysAmber) status = 'PENDING_STALE';
    }

    return {
      worker_id:                    pack.worker_id,
      pack_id:                      pack.pack_id,
      iban_status:                  pack.iban_status,
      identity_verification_status: pack.identity_verification_status,
      bank_confirmation_status:     pack.bank_confirmation_status,
      wps_package_valid:            pack.wps_package?.structureValid ?? false,
      status,
      generated_at:                 pack.generated_at,
    };
  });

  const complete = rows.filter(r => r.status === 'COMPLETE').length;
  const failed   = rows.filter(r => r.status === 'FAILED').length;
  const pending  = rows.filter(r => r.status === 'PENDING' || r.status === 'PENDING_STALE').length;
  const score    = Math.round((complete / packs.length) * 100);

  return { score, total_packs: packs.length, complete_packs: complete, failed_packs: failed, pending_packs: pending, rows, color: scoreColor(score) };
}

/**
 * computeProbationScore — scores based on deadline urgency pressure.
 * RED case (-25 pts each), AMBER case (-8 pts each), base score 100.
 * Returns { score, active_cases, red_cases, amber_cases, green_cases, deadlines, color }.
 */
function computeProbationScore(tenantId, allCases, now) {
  const nowDate  = now || nowIso();
  const cases    = allCases.filter(c => c.tenant_id === tenantId && c.status === 'ACTIVE' && c.decision_status === 'PENDING');

  const deadlines = cases.map(c => {
    const endDate      = c.max_end_date || addDays(c.started_at, c.period_days);
    const daysLeft     = daysBetween(nowDate, endDate);
    const daysSince    = daysBetween(c.started_at, nowDate);
    const isPast80     = daysSince >= 80;
    const evidenceReady = isPast80 && c.evidence_pack_compiled_at != null;

    let urgency;
    if (daysLeft < PROB_POLICY.redDaysThreshold)   urgency = 'RED';
    else if (daysLeft < PROB_POLICY.amberDaysThreshold) urgency = 'AMBER';
    else                                             urgency = 'GREEN';

    return {
      governance_case_id:  c.governance_case_id,
      worker_id:           c.worker_id,
      days_remaining:      daysLeft,
      end_date:            endDate,
      urgency,
      is_day80_plus:       isPast80,
      evidence_ready:      evidenceReady,
      decision_required:   isPast80,
    };
  });

  const redCount   = deadlines.filter(d => d.urgency === 'RED').length;
  const amberCount = deadlines.filter(d => d.urgency === 'AMBER').length;
  const penalty    = (redCount * PROB_POLICY.penaltyPerRedCase) + (amberCount * PROB_POLICY.penaltyPerAmberCase);
  const score      = clamp(100 - penalty, PROB_POLICY.minimumScore, 100);

  return {
    score,
    active_cases: cases.length,
    red_cases:    redCount,
    amber_cases:  amberCount,
    green_cases:  deadlines.filter(d => d.urgency === 'GREEN').length,
    deadlines: deadlines.sort((a, b) => a.days_remaining - b.days_remaining),
    color: scoreColor(score),
  };
}

/**
 * computeDocumentationScore — % of tenant docs NOT expiring within alert window.
 * Returns { score, total_docs, expiring_soon, expired, rows, color }.
 */
function computeDocumentationScore(tenantId, allDocs, now) {
  const nowDate   = now || nowIso();
  const docs      = allDocs.filter(d => d.tenant_id === tenantId && d.expires_at);

  if (docs.length === 0) {
    return { score: 100, total_docs: 0, expiring_soon: 0, expired: 0, rows: [], color: 'GREEN', insufficient_data: false };
  }

  const rows = docs.map(doc => {
    const daysLeft = daysBetween(nowDate, doc.expires_at);
    let status;
    if (daysLeft < 0)                                       status = 'EXPIRED';
    else if (daysLeft <= DOC_POLICY.expiryAlertWindowDays)  status = 'EXPIRING_SOON';
    else                                                     status = 'OK';

    return {
      document_id:   doc.document_id,
      worker_id:     doc.worker_id,
      document_type: doc.document_type,
      expires_at:    doc.expires_at,
      days_remaining: daysLeft,
      status,
    };
  });

  const expired      = rows.filter(r => r.status === 'EXPIRED').length;
  const expiringSoon = rows.filter(r => r.status === 'EXPIRING_SOON').length;
  const ok           = rows.filter(r => r.status === 'OK').length;
  const score        = docs.length > 0 ? Math.round((ok / docs.length) * 100) : 100;

  return {
    score,
    total_docs: docs.length,
    expiring_soon: expiringSoon,
    expired,
    rows: rows
      .filter(r => r.status !== 'OK')
      .sort((a, b) => a.days_remaining - b.days_remaining),
    color: scoreColor(score),
  };
}

// ── overall score ─────────────────────────────────────────────────────────────

/**
 * computeOverallScore — weighted average of the four components.
 * Components with insufficient_data contribute 0 to the weighted sum but
 * their weight is still counted — this intentionally penalises missing data.
 */
function computeOverallScore({ nitaqatScore, wpsScore, probationScore, documentationScore }) {
  const w = SCORING.weights;
  const score = Math.round(
    nitaqatScore.score       * w.nitaqat      +
    wpsScore.score           * w.wps          +
    probationScore.score     * w.probation     +
    documentationScore.score * w.documentation
  );
  return { score: clamp(score, 0, 100), color: scoreColor(score) };
}

// ── dashboard builder ─────────────────────────────────────────────────────────

/**
 * buildDashboard — aggregates all compliance data for a tenant.
 */
async function buildDashboard({ tenantId, wpsStore, probationStore, documentStore, nitaqatStore, now }) {
  assert(tenantId, 'tenantId is required');

  const nowTs = now || nowIso();

  // Parallel fetches
  const [allPacks, allCases, allDocs] = await Promise.all([
    wpsStore      ? wpsStore.allPacks()      : Promise.resolve([]),
    probationStore ? probationStore.allCases() : Promise.resolve([]),
    documentStore  ? documentStore.all()       : Promise.resolve([]),
  ]);

  let zoneData = null;
  if (nitaqatStore && typeof nitaqatStore.getZone === 'function') {
    zoneData = await nitaqatStore.getZone(tenantId);
  }

  const nitaqatScore      = computeNitaqatScore(zoneData);
  const wpsScore          = computeWpsScore(tenantId, allPacks, nowTs);
  const probationScore    = computeProbationScore(tenantId, allCases, nowTs);
  const documentationScore = computeDocumentationScore(tenantId, allDocs, nowTs);
  const overall           = computeOverallScore({ nitaqatScore, wpsScore, probationScore, documentationScore });

  return {
    tenant_id:   tenantId,
    computed_at: nowTs,
    policy_version: POLICY.version,
    overall,
    components: {
      nitaqat:       nitaqatScore,
      wps:           wpsScore,
      probation:     probationScore,
      documentation: documentationScore,
    },
    // Prominent alerts: items requiring immediate attention
    red_alerts: buildRedAlerts({ wpsScore, probationScore, documentationScore }),
  };
}

/**
 * buildRedAlerts — collects all RED-severity items into a flat prominent list.
 * These are never collapsed or hidden.
 */
function buildRedAlerts({ wpsScore, probationScore, documentationScore }) {
  const alerts = [];

  wpsScore.rows
    .filter(r => r.status === 'FAILED')
    .forEach(r => alerts.push({ type: 'WPS_FAILED', worker_id: r.worker_id, pack_id: r.pack_id, severity: 'RED' }));

  probationScore.deadlines
    .filter(d => d.urgency === 'RED')
    .forEach(d => alerts.push({
      type: 'PROBATION_RED_DEADLINE',
      worker_id: d.worker_id,
      governance_case_id: d.governance_case_id,
      days_remaining: d.days_remaining,
      severity: 'RED',
    }));

  probationScore.deadlines
    .filter(d => d.decision_required && d.urgency !== 'RED')
    .forEach(d => alerts.push({
      type: 'PROBATION_DECISION_REQUIRED',
      worker_id: d.worker_id,
      governance_case_id: d.governance_case_id,
      days_remaining: d.days_remaining,
      evidence_ready: d.evidence_ready,
      severity: d.urgency,
    }));

  documentationScore.rows
    .filter(r => r.status === 'EXPIRED')
    .forEach(r => alerts.push({
      type: 'DOCUMENT_EXPIRED',
      worker_id: r.worker_id,
      document_id: r.document_id,
      document_type: r.document_type,
      days_remaining: r.days_remaining,
      severity: 'RED',
    }));

  return alerts;
}

// ── service factory ───────────────────────────────────────────────────────────

function createComplianceRiskService({ wpsStore, probationStore, documentStore, nitaqatStore }) {
  assert(wpsStore,       'wpsStore is required');
  assert(probationStore, 'probationStore is required');
  assert(documentStore,  'documentStore is required');
  // nitaqatStore is optional — absent means Nitaqat zone shows insufficient_data

  return {
    async buildDashboard({ tenantId, now }) {
      return buildDashboard({ tenantId, wpsStore, probationStore, documentStore, nitaqatStore: nitaqatStore || null, now });
    },

    // Exposed for direct testing
    computeNitaqatScore,
    computeWpsScore,
    computeProbationScore,
    computeDocumentationScore,
    computeOverallScore,
    buildRedAlerts,
    scoreColor,
    POLICY,
  };
}

module.exports = {
  createComplianceRiskService,
  computeNitaqatScore,
  computeWpsScore,
  computeProbationScore,
  computeDocumentationScore,
  computeOverallScore,
  buildRedAlerts,
  scoreColor,
  POLICY,
};
