"use strict"

/**
 * PROWORK PHASE 22 — Continuous Control Attestation + Compliance Reporting
 *
 * Provides:
 * - ATTESTATION_STATUSES: pass, fail, degraded, unavailable
 * - REPORT_TYPES: governance.control_report, tenant.compliance_report,
 *                 jurisdiction.compliance_report, incident.assurance_report
 * - REPORT_STATUSES: pass, fail, degraded, unavailable
 * - CONTROL_FAMILIES: 12 governed families
 * - recordAttestation(): fail-closed on unknown/missing status or control_id
 * - resolveAttestation(): look up by control_id (most-recent)
 * - generateReport(): fail-closed on unknown type or missing critical attestations
 * - resolveReport(): look up by report_id
 * - getAttestationState(): read-only snapshot
 * - exportAttestation(): machine-readable artifact, no mutation
 * - getReportState(): read-only snapshot
 * - exportReports(): machine-readable artifact, no mutation
 *
 * Rules:
 * - unknown attestation status → reason: "unknown_attestation_status"
 * - missing control_id        → reason: "missing_control_id"
 * - unknown report type       → reason: "unknown_report_type"
 * - missing critical control attestation for report scope → reason: "missing_critical_attestation"
 * - critical families are: rbac_control, permission_control
 *   (every report type requires at least one recorded attestation per critical family)
 */

const fs     = require("fs")
const crypto = require("crypto")

// ---------------------------------------------------------------------------
// Schema version
// ---------------------------------------------------------------------------
const CONTROL_ATTESTATION_VERSION = "1.0"

// ---------------------------------------------------------------------------
// Attestation status catalog
// ---------------------------------------------------------------------------
const ATTESTATION_STATUSES = Object.freeze({
  PASS:        "pass",
  FAIL:        "fail",
  DEGRADED:    "degraded",
  UNAVAILABLE: "unavailable",
})
const _VALID_ATTESTATION_STATUSES = new Set(Object.values(ATTESTATION_STATUSES))

// ---------------------------------------------------------------------------
// Report type catalog
// ---------------------------------------------------------------------------
const REPORT_TYPES = Object.freeze({
  GOVERNANCE_CONTROL:      "governance.control_report",
  TENANT_COMPLIANCE:       "tenant.compliance_report",
  JURISDICTION_COMPLIANCE: "jurisdiction.compliance_report",
  INCIDENT_ASSURANCE:      "incident.assurance_report",
})
const _VALID_REPORT_TYPES = new Set(Object.values(REPORT_TYPES))

// ---------------------------------------------------------------------------
// Report status catalog (mirrors attestation semantics)
// ---------------------------------------------------------------------------
const REPORT_STATUSES = Object.freeze({
  PASS:        "pass",
  FAIL:        "fail",
  DEGRADED:    "degraded",
  UNAVAILABLE: "unavailable",
})

// ---------------------------------------------------------------------------
// Control family catalog
// ---------------------------------------------------------------------------
const CONTROL_FAMILIES = Object.freeze([
  "rbac_control",
  "permission_control",
  "audit_evidence_control",
  "approval_control",
  "sovereign_policy_control",
  "tenant_jurisdiction_control",
  "residency_retention_control",
  "disclosure_legal_hold_control",
  "external_review_control",
  "incident_containment_control",
  "continuity_dr_control",
  "restoration_assurance_control",
])

// Critical families required for any report generation (fail-closed)
const _CRITICAL_FAMILIES = new Set(["rbac_control", "permission_control"])

// ---------------------------------------------------------------------------
// In-memory state
// attestation_id → entry
// report_id      → entry
// control_id     → latest attestation_id (for resolveAttestation lookups)
// ---------------------------------------------------------------------------
const _attestations  = new Map()
const _reports       = new Map()
const _latestByControlId = new Map()

// ---------------------------------------------------------------------------
// recordAttestation
// ---------------------------------------------------------------------------
function recordAttestation({ controlId, controlFamily, status, scope, evidenceRef, policyVersion }) {
  const cid = String(controlId    || "").trim()
  const fam = String(controlFamily || "").trim()
  const st  = String(status       || "").trim()
  const sc  = String(scope        || "").trim() || "global"
  const er  = String(evidenceRef  || "").trim() || null
  const pv  = String(policyVersion || "").trim() || CONTROL_ATTESTATION_VERSION

  if (!cid) {
    return { ok: false, reason: "missing_control_id" }
  }
  if (!_VALID_ATTESTATION_STATUSES.has(st)) {
    return { ok: false, reason: "unknown_attestation_status", provided_status: st || null }
  }

  const id    = `att_${crypto.randomUUID()}`
  const entry = {
    attestation_id:              id,
    control_id:                  cid,
    control_family:              fam || "unknown",
    attestation_status:          st,
    attestation_scope:           sc,
    assurance_evidence_ref:      er,
    attestation_policy_version:  pv,
    control_attestation_version: CONTROL_ATTESTATION_VERSION,
    attested_at:                 new Date().toISOString(),
  }
  _attestations.set(id, entry)
  _latestByControlId.set(cid, id)
  return { ok: true, data: { ...entry } }
}

// ---------------------------------------------------------------------------
// resolveAttestation — returns latest attestation for a given control_id
// ---------------------------------------------------------------------------
function resolveAttestation(controlId) {
  const cid = String(controlId || "").trim()
  if (!cid) return { ok: false, reason: "missing_control_id" }
  const attId = _latestByControlId.get(cid)
  if (!attId) return { ok: false, reason: "unknown_control_id", control_id: cid }
  const entry = _attestations.get(attId)
  if (!entry) return { ok: false, reason: "unknown_control_id", control_id: cid }
  return { ok: true, attestation: { ...entry } }
}

// ---------------------------------------------------------------------------
// _checkCriticalAttestations — used by generateReport
// Returns list of missing critical family names
// ---------------------------------------------------------------------------
function _checkCriticalAttestations() {
  const missing = []
  for (const family of _CRITICAL_FAMILIES) {
    const has = Array.from(_attestations.values()).some(a => a.control_family === family)
    if (!has) missing.push(family)
  }
  return missing
}

// ---------------------------------------------------------------------------
// _deriveReportStatus — derive report-level status from included attestations
// ---------------------------------------------------------------------------
function _deriveReportStatus(includedAttestations) {
  if (includedAttestations.length === 0) return REPORT_STATUSES.UNAVAILABLE
  const statuses = new Set(includedAttestations.map(a => a.attestation_status))
  if (statuses.has(ATTESTATION_STATUSES.FAIL))        return REPORT_STATUSES.FAIL
  if (statuses.has(ATTESTATION_STATUSES.UNAVAILABLE)) return REPORT_STATUSES.UNAVAILABLE
  if (statuses.has(ATTESTATION_STATUSES.DEGRADED))    return REPORT_STATUSES.DEGRADED
  return REPORT_STATUSES.PASS
}

// ---------------------------------------------------------------------------
// generateReport
// ---------------------------------------------------------------------------
function generateReport({ reportType, reportScope, tenantId, jurisdictionCode, policyVersion }) {
  const rt  = String(reportType  || "").trim()
  const sc  = String(reportScope || "").trim() || "global"
  const tid = String(tenantId    || "").trim() || null
  const jc  = String(jurisdictionCode || "").trim() || null
  const pv  = String(policyVersion || "").trim() || CONTROL_ATTESTATION_VERSION

  if (!_VALID_REPORT_TYPES.has(rt)) {
    return { ok: false, reason: "unknown_report_type", provided_type: rt || null }
  }

  // Fail-closed: require critical control families to have been attested
  const missingCritical = _checkCriticalAttestations()
  if (missingCritical.length > 0) {
    return { ok: false, reason: "missing_critical_attestation", missing_families: missingCritical }
  }

  // Collect all attestations relevant to this report type
  const allAtts = Array.from(_attestations.values())

  // Filter by tenant/jurisdiction scope if applicable
  let included = allAtts
  if (rt === REPORT_TYPES.TENANT_COMPLIANCE && tid) {
    // include attestations scoped to this tenant or global
    included = allAtts.filter(a => a.attestation_scope === tid || a.attestation_scope === "global" || a.attestation_scope === sc)
  } else if (rt === REPORT_TYPES.JURISDICTION_COMPLIANCE && jc) {
    included = allAtts.filter(a => a.attestation_scope === jc || a.attestation_scope === "global" || a.attestation_scope === sc)
  }

  // Deduplicate: only latest per control_id in the included set
  const latestMap = new Map()
  for (const a of included) {
    const prev = latestMap.get(a.control_id)
    if (!prev || new Date(a.attested_at) >= new Date(prev.attested_at)) {
      latestMap.set(a.control_id, a)
    }
  }
  const deduped = Array.from(latestMap.values())

  const reportStatus = _deriveReportStatus(deduped)
  const id     = `rpt_${crypto.randomUUID()}`
  const entry  = {
    report_id:                   id,
    report_type:                 rt,
    report_scope:                sc,
    report_status:               reportStatus,
    tenant_id:                   tid,
    jurisdiction_code:           jc,
    report_policy_version:       pv,
    control_attestation_version: CONTROL_ATTESTATION_VERSION,
    generated_at:                new Date().toISOString(),
    attestation_count:           deduped.length,
    attestations:                deduped.map(a => ({ ...a })),
  }
  _reports.set(id, entry)
  return { ok: true, data: { ...entry } }
}

// ---------------------------------------------------------------------------
// resolveReport
// ---------------------------------------------------------------------------
function resolveReport(reportId) {
  const id = String(reportId || "").trim()
  if (!id) return { ok: false, reason: "missing_report_id" }
  const entry = _reports.get(id)
  if (!entry) return { ok: false, reason: "unknown_report_id", report_id: id }
  return { ok: true, report: { ...entry, attestations: entry.attestations.map(a => ({ ...a })) } }
}

// ---------------------------------------------------------------------------
// getAttestationState — read-only snapshot
// ---------------------------------------------------------------------------
function getAttestationState() {
  const attestations = Array.from(_attestations.values()).map(a => ({ ...a }))
  const byFamily = {}
  for (const a of attestations) {
    if (!byFamily[a.control_family]) byFamily[a.control_family] = []
    byFamily[a.control_family].push(a)
  }
  return {
    attestation_count:           attestations.length,
    control_attestation_version: CONTROL_ATTESTATION_VERSION,
    attestations,
    by_family:                   byFamily,
  }
}

// ---------------------------------------------------------------------------
// exportAttestation — machine-readable artifact, no mutation
// ---------------------------------------------------------------------------
function exportAttestation(outputPath) {
  const state    = getAttestationState()
  const artifact = {
    exported_at:                 new Date().toISOString(),
    control_attestation_version: CONTROL_ATTESTATION_VERSION,
    attestation_count:           state.attestation_count,
    attestations:                state.attestations,
    by_family:                   state.by_family,
  }
  if (outputPath) {
    fs.writeFileSync(outputPath, JSON.stringify(artifact, null, 2) + "\n", "utf8")
  }
  return artifact
}

// ---------------------------------------------------------------------------
// getReportState — read-only snapshot
// ---------------------------------------------------------------------------
function getReportState() {
  const reports = Array.from(_reports.values()).map(r => ({
    ...r,
    attestations: r.attestations.map(a => ({ ...a })),
  }))
  return {
    report_count:                reports.length,
    control_attestation_version: CONTROL_ATTESTATION_VERSION,
    reports,
  }
}

// ---------------------------------------------------------------------------
// exportReports — machine-readable artifact, no mutation
// ---------------------------------------------------------------------------
function exportReports(outputPath) {
  const state    = getReportState()
  const artifact = {
    exported_at:                 new Date().toISOString(),
    control_attestation_version: CONTROL_ATTESTATION_VERSION,
    report_count:                state.report_count,
    reports:                     state.reports,
  }
  if (outputPath) {
    fs.writeFileSync(outputPath, JSON.stringify(artifact, null, 2) + "\n", "utf8")
  }
  return artifact
}

module.exports = {
  CONTROL_ATTESTATION_VERSION,
  ATTESTATION_STATUSES,
  REPORT_TYPES,
  REPORT_STATUSES,
  CONTROL_FAMILIES,
  recordAttestation,
  resolveAttestation,
  generateReport,
  resolveReport,
  getAttestationState,
  exportAttestation,
  getReportState,
  exportReports,
}
