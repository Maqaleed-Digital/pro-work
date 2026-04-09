"use strict"

/**
 * PROWORK PHASE 23 — Governance Closure + Executive Assurance Pack
 *
 * Provides:
 * - CLOSURE_STATUSES: ready, blocked, incomplete, closed
 * - ASSURANCE_STATUSES: draft, validated, blocked, issued
 * - createClosure(): fail-closed on unknown status or missing critical evidence
 * - resolveClosure(): look up by closure_id
 * - getClosureState(): read-only snapshot
 * - exportClosures(): machine-readable artifact, no mutation
 * - createAssurancePack(): fail-closed on missing/unknown closure or unknown status
 * - resolveAssurancePack(): look up by assurance_pack_id
 * - getAssurancePackState(): read-only snapshot
 * - exportAssurancePacks(): machine-readable artifact, no mutation
 * - generateAssuranceSummary(): cross-pack executive summary
 *
 * Rules:
 * - unknown closure_status   → reason: "unknown_closure_status"
 * - ready/closed without criticalEvidenceRefs → reason: "missing_critical_evidence"
 * - unknown assurance_status → reason: "unknown_assurance_status"
 * - missing closure_id       → reason: "missing_closure_id"
 * - unknown closure_id       → reason: "unknown_closure_id"
 * - READY/CLOSED statuses require at least one criticalEvidenceRef
 * - assurance pack requires a valid existing closure reference
 */

const fs     = require("fs")
const crypto = require("crypto")

// ---------------------------------------------------------------------------
// Schema version
// ---------------------------------------------------------------------------
const GOVERNANCE_CLOSURE_VERSION = "1.0"

// ---------------------------------------------------------------------------
// Closure status catalog
// ---------------------------------------------------------------------------
const CLOSURE_STATUSES = Object.freeze({
  READY:      "ready",
  BLOCKED:    "blocked",
  INCOMPLETE: "incomplete",
  CLOSED:     "closed",
})
const _VALID_CLOSURE_STATUSES = new Set(Object.values(CLOSURE_STATUSES))

// Statuses that require critical evidence refs
const _EVIDENCE_REQUIRED_STATUSES = new Set(["ready", "closed"])

// ---------------------------------------------------------------------------
// Assurance status catalog
// ---------------------------------------------------------------------------
const ASSURANCE_STATUSES = Object.freeze({
  DRAFT:     "draft",
  VALIDATED: "validated",
  BLOCKED:   "blocked",
  ISSUED:    "issued",
})
const _VALID_ASSURANCE_STATUSES = new Set(Object.values(ASSURANCE_STATUSES))

// ---------------------------------------------------------------------------
// In-memory state
// ---------------------------------------------------------------------------
const _closures       = new Map()  // closure_id → entry
const _assurancePacks = new Map()  // assurance_pack_id → entry

// ---------------------------------------------------------------------------
// createClosure
// ---------------------------------------------------------------------------
function createClosure({ scope, tenantId, jurisdictionCode, closureStatus, criticalEvidenceRefs, policyVersion }) {
  const st  = String(closureStatus || "").trim()
  const sc  = String(scope         || "").trim() || "global"
  const tid = String(tenantId      || "").trim() || null
  const jc  = String(jurisdictionCode || "").trim() || null
  const pv  = String(policyVersion || "").trim() || GOVERNANCE_CLOSURE_VERSION
  const evs = Array.isArray(criticalEvidenceRefs) ? criticalEvidenceRefs.filter(Boolean) : []

  if (!_VALID_CLOSURE_STATUSES.has(st)) {
    return { ok: false, reason: "unknown_closure_status", provided_status: st || null }
  }
  if (_EVIDENCE_REQUIRED_STATUSES.has(st) && evs.length === 0) {
    return { ok: false, reason: "missing_critical_evidence", required_for_status: st }
  }

  const id    = `cls_${crypto.randomUUID()}`
  const entry = {
    closure_id:                  id,
    closure_scope:               sc,
    closure_status:              st,
    tenant_id:                   tid,
    jurisdiction_code:           jc,
    critical_evidence_refs:      evs,
    closure_policy_version:      pv,
    governance_closure_version:  GOVERNANCE_CLOSURE_VERSION,
    closure_generated_at:        new Date().toISOString(),
  }
  _closures.set(id, entry)
  return { ok: true, data: { ...entry } }
}

// ---------------------------------------------------------------------------
// resolveClosure
// ---------------------------------------------------------------------------
function resolveClosure(closureId) {
  const id = String(closureId || "").trim()
  if (!id) return { ok: false, reason: "missing_closure_id" }
  const entry = _closures.get(id)
  if (!entry) return { ok: false, reason: "unknown_closure_id", closure_id: id }
  return { ok: true, closure: { ...entry } }
}

// ---------------------------------------------------------------------------
// getClosureState — read-only snapshot
// ---------------------------------------------------------------------------
function getClosureState() {
  const closures = Array.from(_closures.values()).map(c => ({ ...c }))
  const byStatus = {}
  for (const c of closures) {
    if (!byStatus[c.closure_status]) byStatus[c.closure_status] = []
    byStatus[c.closure_status].push(c)
  }
  return {
    closure_count:              closures.length,
    governance_closure_version: GOVERNANCE_CLOSURE_VERSION,
    closures,
    by_status:                  byStatus,
  }
}

// ---------------------------------------------------------------------------
// exportClosures — machine-readable artifact, no mutation
// ---------------------------------------------------------------------------
function exportClosures(outputPath) {
  const state    = getClosureState()
  const artifact = {
    exported_at:                new Date().toISOString(),
    governance_closure_version: GOVERNANCE_CLOSURE_VERSION,
    closure_count:              state.closure_count,
    closures:                   state.closures,
    by_status:                  state.by_status,
  }
  if (outputPath) {
    fs.writeFileSync(outputPath, JSON.stringify(artifact, null, 2) + "\n", "utf8")
  }
  return artifact
}

// ---------------------------------------------------------------------------
// getClosuresForTenant — filtered snapshot
// ---------------------------------------------------------------------------
function getClosuresForTenant(tenantId) {
  const tid = String(tenantId || "").trim()
  if (!tid) return { ok: false, reason: "missing_tenant_id" }
  const closures = Array.from(_closures.values())
    .filter(c => c.tenant_id === tid || c.closure_scope === tid)
    .map(c => ({ ...c }))
  return {
    ok: true,
    data: {
      tenant_id:                  tid,
      closure_count:              closures.length,
      governance_closure_version: GOVERNANCE_CLOSURE_VERSION,
      closures,
    },
  }
}

// ---------------------------------------------------------------------------
// getClosuresForJurisdiction — filtered snapshot
// ---------------------------------------------------------------------------
function getClosuresForJurisdiction(jurisdictionCode) {
  const jc = String(jurisdictionCode || "").trim()
  if (!jc) return { ok: false, reason: "missing_jurisdiction_code" }
  const closures = Array.from(_closures.values())
    .filter(c => c.jurisdiction_code === jc || c.closure_scope === jc)
    .map(c => ({ ...c }))
  return {
    ok: true,
    data: {
      jurisdiction_code:          jc,
      closure_count:              closures.length,
      governance_closure_version: GOVERNANCE_CLOSURE_VERSION,
      closures,
    },
  }
}

// ---------------------------------------------------------------------------
// createAssurancePack
// ---------------------------------------------------------------------------
function createAssurancePack({ scope, closureId, assuranceStatus, summaryRef, policyVersion }) {
  const cid = String(closureId       || "").trim()
  const st  = String(assuranceStatus || "").trim()
  const sc  = String(scope           || "").trim() || "global"
  const sr  = String(summaryRef      || "").trim() || null
  const pv  = String(policyVersion   || "").trim() || GOVERNANCE_CLOSURE_VERSION

  if (!cid) {
    return { ok: false, reason: "missing_closure_id" }
  }
  if (!_VALID_ASSURANCE_STATUSES.has(st)) {
    return { ok: false, reason: "unknown_assurance_status", provided_status: st || null }
  }
  const closureEntry = _closures.get(cid)
  if (!closureEntry) {
    return { ok: false, reason: "unknown_closure_id", closure_id: cid }
  }

  const id    = `acp_${crypto.randomUUID()}`
  const entry = {
    assurance_pack_id:           id,
    assurance_scope:             sc,
    assurance_status:            st,
    closure_id:                  cid,
    closure_status:              closureEntry.closure_status,
    summary_ref:                 sr,
    assurance_pack_version:      pv,
    governance_closure_version:  GOVERNANCE_CLOSURE_VERSION,
    assurance_generated_at:      new Date().toISOString(),
  }
  _assurancePacks.set(id, entry)
  return { ok: true, data: { ...entry } }
}

// ---------------------------------------------------------------------------
// resolveAssurancePack
// ---------------------------------------------------------------------------
function resolveAssurancePack(assurancePackId) {
  const id = String(assurancePackId || "").trim()
  if (!id) return { ok: false, reason: "missing_assurance_pack_id" }
  const entry = _assurancePacks.get(id)
  if (!entry) return { ok: false, reason: "unknown_assurance_pack_id", assurance_pack_id: id }
  return { ok: true, assurance_pack: { ...entry } }
}

// ---------------------------------------------------------------------------
// getAssurancePackState — read-only snapshot
// ---------------------------------------------------------------------------
function getAssurancePackState() {
  const packs = Array.from(_assurancePacks.values()).map(p => ({ ...p }))
  const byStatus = {}
  for (const p of packs) {
    if (!byStatus[p.assurance_status]) byStatus[p.assurance_status] = []
    byStatus[p.assurance_status].push(p)
  }
  return {
    assurance_pack_count:        packs.length,
    governance_closure_version:  GOVERNANCE_CLOSURE_VERSION,
    assurance_packs:             packs,
    by_status:                   byStatus,
  }
}

// ---------------------------------------------------------------------------
// exportAssurancePacks — machine-readable artifact, no mutation
// ---------------------------------------------------------------------------
function exportAssurancePacks(outputPath) {
  const state    = getAssurancePackState()
  const artifact = {
    exported_at:                 new Date().toISOString(),
    governance_closure_version:  GOVERNANCE_CLOSURE_VERSION,
    assurance_pack_count:        state.assurance_pack_count,
    assurance_packs:             state.assurance_packs,
    by_status:                   state.by_status,
  }
  if (outputPath) {
    fs.writeFileSync(outputPath, JSON.stringify(artifact, null, 2) + "\n", "utf8")
  }
  return artifact
}

// ---------------------------------------------------------------------------
// generateAssuranceSummary — executive-level cross-pack summary
// ---------------------------------------------------------------------------
function generateAssuranceSummary() {
  const packs    = Array.from(_assurancePacks.values()).map(p => ({ ...p }))
  const closures = Array.from(_closures.values()).map(c => ({ ...c }))
  const issued   = packs.filter(p => p.assurance_status === ASSURANCE_STATUSES.ISSUED)
  const blocked  = packs.filter(p => p.assurance_status === ASSURANCE_STATUSES.BLOCKED)
  const overall  = issued.length > 0 && blocked.length === 0
    ? "issued"
    : blocked.length > 0
      ? "blocked"
      : packs.length > 0
        ? "in_progress"
        : "no_packs"
  return {
    summary_generated_at:        new Date().toISOString(),
    governance_closure_version:  GOVERNANCE_CLOSURE_VERSION,
    overall_assurance_status:    overall,
    closure_count:               closures.length,
    assurance_pack_count:        packs.length,
    issued_count:                issued.length,
    blocked_count:               blocked.length,
    closures_summary:            closures.map(c => ({
      closure_id:     c.closure_id,
      closure_status: c.closure_status,
      closure_scope:  c.closure_scope,
    })),
    packs_summary:               packs.map(p => ({
      assurance_pack_id: p.assurance_pack_id,
      assurance_status:  p.assurance_status,
      closure_id:        p.closure_id,
    })),
  }
}

module.exports = {
  GOVERNANCE_CLOSURE_VERSION,
  CLOSURE_STATUSES,
  ASSURANCE_STATUSES,
  createClosure,
  resolveClosure,
  getClosureState,
  exportClosures,
  getClosuresForTenant,
  getClosuresForJurisdiction,
  createAssurancePack,
  resolveAssurancePack,
  getAssurancePackState,
  exportAssurancePacks,
  generateAssuranceSummary,
}
