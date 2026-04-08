"use strict"

/**
 * PROWORK PHASE 16 — Data Residency + Evidence Retention Governance
 *
 * Provides:
 * - Built-in residency region catalog (KSA, GCC, GLOBAL)
 * - Built-in retention class catalog (audit.short_term, audit.long_term,
 *   approval.long_term, sovereign.control.long_term)
 * - resolveResidency(): fail-closed on unknown/inactive region
 * - resolveRetention(): fail-closed on unknown/inactive retention class
 * - validateResidencyCompatibility(): deny incompatible residency for jurisdiction
 * - setRetentionStatus(): in-memory admin/test mutation (disable/enable class)
 * - getGovernanceState(): read-only snapshot
 * - exportGovernance(): machine-readable artifact (no state mutation)
 *
 * Rules:
 * - unknown residency region → fail closed (reason: "unknown_region")
 * - inactive residency region → fail closed (reason: "inactive_region")
 * - unknown retention class → fail closed (reason: "unknown_retention_class")
 * - inactive retention class → fail closed (reason: "inactive_retention_class")
 * - residency incompatible with jurisdiction → fail closed (reason: "incompatible_residency")
 * - GLOBAL residency request → compatible with all jurisdictions
 * - KSA jurisdiction → accepts only KSA or GLOBAL residency
 * - GCC jurisdiction → accepts KSA, GCC, or GLOBAL residency
 * - GLOBAL jurisdiction → accepts any known residency
 */

const fs = require("fs")

// ---------------------------------------------------------------------------
// Schema version
// ---------------------------------------------------------------------------
const EVIDENCE_GOVERNANCE_VERSION = "1.0"

// ---------------------------------------------------------------------------
// Residency region catalog — built-in and authoritative
// ---------------------------------------------------------------------------
const RESIDENCY_REGIONS = Object.freeze({
  KSA: Object.freeze({
    region:         "KSA",
    name:           "Kingdom of Saudi Arabia",
    status:         "active",
    policy_version: "1.0",
    description:    "Data stored and processed exclusively within Saudi Arabia",
  }),
  GCC: Object.freeze({
    region:         "GCC",
    name:           "Gulf Cooperation Council",
    status:         "active",
    policy_version: "1.0",
    description:    "Data stored and processed within GCC member states",
  }),
  GLOBAL: Object.freeze({
    region:         "GLOBAL",
    name:           "Global",
    status:         "active",
    policy_version: "1.0",
    description:    "No regional restriction — globally distributed",
  }),
})

const RESIDENCY_STATUSES = Object.freeze({
  ACTIVE:   "active",
  INACTIVE: "inactive",
})

// ---------------------------------------------------------------------------
// Residency compatibility: which regions are permitted for each jurisdiction
// KSA jurisdiction → must store in KSA or GLOBAL
// GCC jurisdiction → may store in KSA, GCC, or GLOBAL
// GLOBAL jurisdiction → any known region
// ---------------------------------------------------------------------------
const _RESIDENCY_COMPAT = Object.freeze({
  KSA:    Object.freeze(new Set(["KSA", "GLOBAL"])),
  GCC:    Object.freeze(new Set(["KSA", "GCC", "GLOBAL"])),
  GLOBAL: Object.freeze(new Set(["KSA", "GCC", "GLOBAL"])),
})

// ---------------------------------------------------------------------------
// Retention class catalog — built-in and authoritative
// retention_days: number of days evidence must be retained; -1 = indefinite
// ---------------------------------------------------------------------------
const _DEFAULT_RETENTION = {
  "audit.short_term":            { status: "active", retention_days: 90 },
  "audit.long_term":             { status: "active", retention_days: 2555 },
  "approval.long_term":          { status: "active", retention_days: 2555 },
  "sovereign.control.long_term": { status: "active", retention_days: -1  },
}

const RETENTION_CLASSES = Object.freeze({
  "audit.short_term": Object.freeze({
    retention_class:   "audit.short_term",
    name:              "Audit Short Term",
    status:            "active",
    retention_days:    90,
    policy_version:    "1.0",
    description:       "Short-term authorization audit records (90 days)",
  }),
  "audit.long_term": Object.freeze({
    retention_class:   "audit.long_term",
    name:              "Audit Long Term",
    status:            "active",
    retention_days:    2555,
    policy_version:    "1.0",
    description:       "Long-term authorization audit records (7 years)",
  }),
  "approval.long_term": Object.freeze({
    retention_class:   "approval.long_term",
    name:              "Approval Long Term",
    status:            "active",
    retention_days:    2555,
    policy_version:    "1.0",
    description:       "Approval request/decision records (7 years)",
  }),
  "sovereign.control.long_term": Object.freeze({
    retention_class:   "sovereign.control.long_term",
    name:              "Sovereign Control Long Term",
    status:            "active",
    retention_days:    -1,
    policy_version:    "1.0",
    description:       "Sovereign control registry evidence (indefinite)",
  }),
})

// ---------------------------------------------------------------------------
// In-memory mutable retention status (admin/test overrides)
// retention_class → { status }
// ---------------------------------------------------------------------------
const _retentionOverrides = new Map()
for (const [key, def] of Object.entries(_DEFAULT_RETENTION)) {
  _retentionOverrides.set(key, { status: def.status })
}

// ---------------------------------------------------------------------------
// resolveResidency — fail-closed on unknown or inactive region
// ---------------------------------------------------------------------------
function resolveResidency(region) {
  const r = String(region || "").trim().toUpperCase()
  if (!r || !RESIDENCY_REGIONS[r]) {
    return { ok: false, reason: "unknown_region", residency_region: r || null }
  }
  const entry = RESIDENCY_REGIONS[r]
  if (entry.status !== RESIDENCY_STATUSES.ACTIVE) {
    return { ok: false, reason: "inactive_region", residency_region: r }
  }
  return { ok: true, entry, residency_region: r }
}

// ---------------------------------------------------------------------------
// resolveRetention — fail-closed on unknown or inactive retention class
// ---------------------------------------------------------------------------
function resolveRetention(retentionClass) {
  const k = String(retentionClass || "").trim()
  if (!k || !RETENTION_CLASSES[k]) {
    return { ok: false, reason: "unknown_retention_class", retention_class: k || null }
  }
  const base = RETENTION_CLASSES[k]
  const override = _retentionOverrides.get(k)
  const status = override ? override.status : base.status
  if (status !== "active") {
    return { ok: false, reason: "inactive_retention_class", retention_class: k }
  }
  return { ok: true, entry: { ...base, status }, retention_class: k }
}

// ---------------------------------------------------------------------------
// validateResidencyCompatibility
// requestedRegion:  the region from the request (X-Residency-Region)
// jurisdictionCode: the tenant's jurisdiction (from TenantJurisdiction)
// GLOBAL residency → always compatible
// GLOBAL jurisdiction → accepts any known region
// ---------------------------------------------------------------------------
function validateResidencyCompatibility(requestedRegion, jurisdictionCode) {
  const rRegion = String(requestedRegion  || "").trim().toUpperCase()
  const jCode   = String(jurisdictionCode || "GLOBAL").trim().toUpperCase()

  if (!rRegion) {
    return { ok: false, reason: "missing_region" }
  }
  if (!RESIDENCY_REGIONS[rRegion]) {
    return { ok: false, reason: "unknown_region", requested: rRegion }
  }
  // GLOBAL residency is always compatible with any jurisdiction
  if (rRegion === "GLOBAL") {
    return { ok: true, reason: "global_residency" }
  }
  // GLOBAL jurisdiction accepts any known residency
  if (jCode === "GLOBAL" || !_RESIDENCY_COMPAT[jCode]) {
    return { ok: true, reason: "global_jurisdiction" }
  }
  const accepted = _RESIDENCY_COMPAT[jCode]
  if (!accepted.has(rRegion)) {
    return { ok: false, reason: "incompatible_residency", requested: rRegion, jurisdiction: jCode }
  }
  return { ok: true, reason: "compatible", requested: rRegion, jurisdiction: jCode }
}

// ---------------------------------------------------------------------------
// setRetentionStatus — in-memory mutation (admin + test use only)
// ---------------------------------------------------------------------------
function setRetentionStatus(retentionClass, status) {
  const k = String(retentionClass || "").trim()
  if (!k || !RETENTION_CLASSES[k]) {
    return { ok: false, reason: "unknown_retention_class" }
  }
  const validStatuses = new Set(["active", "inactive"])
  if (!validStatuses.has(String(status))) {
    return { ok: false, reason: "invalid_status" }
  }
  _retentionOverrides.set(k, { status: String(status) })
  return { ok: true, retention_class: k, status: String(status) }
}

// ---------------------------------------------------------------------------
// getGovernanceState — read-only snapshot
// ---------------------------------------------------------------------------
function getGovernanceState() {
  const regions = Object.values(RESIDENCY_REGIONS).map(r => ({ ...r }))
  const classes  = Object.values(RETENTION_CLASSES).map(c => {
    const override = _retentionOverrides.get(c.retention_class)
    return { ...c, status: override ? override.status : c.status }
  })
  return { regions, retention_classes: classes }
}

// ---------------------------------------------------------------------------
// exportGovernance — write JSON artifact (does not mutate state)
// ---------------------------------------------------------------------------
function exportGovernance(outputPath) {
  const state    = getGovernanceState()
  const artifact = {
    exported_at:                 new Date().toISOString(),
    evidence_governance_version: EVIDENCE_GOVERNANCE_VERSION,
    residency_region_count:      state.regions.length,
    retention_class_count:       state.retention_classes.length,
    residency_regions:           state.regions,
    retention_classes:           state.retention_classes,
  }
  if (outputPath) {
    fs.writeFileSync(outputPath, JSON.stringify(artifact, null, 2) + "\n", "utf8")
  }
  return artifact
}

module.exports = {
  EVIDENCE_GOVERNANCE_VERSION,
  RESIDENCY_REGIONS,
  RESIDENCY_STATUSES,
  RETENTION_CLASSES,
  resolveResidency,
  resolveRetention,
  validateResidencyCompatibility,
  setRetentionStatus,
  getGovernanceState,
  exportGovernance,
}
