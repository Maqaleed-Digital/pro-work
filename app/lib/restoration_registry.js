"use strict"

/**
 * PROWORK PHASE 21 — Controlled Service Restoration + Post-Incident Assurance
 *
 * Provides:
 * - Restoration status catalog (pending, in_progress, validated, completed)
 * - Assurance status catalog (pending, verified, failed)
 * - In-memory restoration registry
 * - initiateRestoration(): requires explicit approval; creates pending restoration
 * - applyRestorationPhase(): pending → in_progress
 * - startAssurance(): marks assurance as started (logs transition)
 * - verifyAssurance(): in_progress → validated (passed) or revert to pending (failed)
 * - completeRestoration(): validated → completed
 * - resolveRestoration(): fail-closed on unknown/invalid ID
 * - isRestorationValidated(): checks if a restoration is validated or completed
 * - getGovernanceState(): read-only snapshot
 * - exportGovernance(): machine-readable artifact (no state mutation)
 *
 * Rules:
 * - no restoration without explicit approved_by → reason: "missing_approval"
 * - missing restoration context → fail closed (reason: "missing_restoration_id")
 * - unknown restoration → fail closed (reason: "unknown_restoration_id")
 * - restoration not validated → fail closed (reason: "restoration_not_validated")
 * - failed assurance → reverts restoration to pending
 * - completeRestoration on non-validated → fail closed (reason: "assurance_not_verified")
 */

const fs     = require("fs")
const crypto = require("crypto")

// ---------------------------------------------------------------------------
// Schema version
// ---------------------------------------------------------------------------
const RESTORATION_GOVERNANCE_VERSION = "1.0"

// ---------------------------------------------------------------------------
// Restoration status catalog
// ---------------------------------------------------------------------------
const RESTORATION_STATUSES = Object.freeze({
  PENDING:     "pending",
  IN_PROGRESS: "in_progress",
  VALIDATED:   "validated",
  COMPLETED:   "completed",
})

// Statuses that are considered cleared for governed execution
const _CLEARED_STATUSES = new Set([RESTORATION_STATUSES.VALIDATED, RESTORATION_STATUSES.COMPLETED])

// ---------------------------------------------------------------------------
// Assurance status catalog
// ---------------------------------------------------------------------------
const ASSURANCE_STATUSES = Object.freeze({
  PENDING:  "pending",
  VERIFIED: "verified",
  FAILED:   "failed",
})

// ---------------------------------------------------------------------------
// In-memory restoration registry
// restoration_id → { restoration_id, restoration_status, restoration_scope,
//   restoration_approved_by, restoration_phase, incident_id,
//   assurance_status, assurance_checks, assurance_evidence_ref,
//   created_at, phase_applied_at, assurance_started_at,
//   validated_at, completed_at }
// ---------------------------------------------------------------------------
const _restorations = new Map()

// ---------------------------------------------------------------------------
// initiateRestoration — requires explicit approval
// ---------------------------------------------------------------------------
function initiateRestoration({ scope, approvedBy, incidentId, assuranceChecks }) {
  const sb = String(scope      || "").trim()
  const ab = String(approvedBy || "").trim()
  const iid = String(incidentId || "").trim()
  if (!ab) {
    return { ok: false, reason: "missing_approval" }
  }
  const id    = `rest_${crypto.randomUUID()}`
  const entry = {
    restoration_id:                  id,
    restoration_status:              RESTORATION_STATUSES.PENDING,
    restoration_scope:               sb || "general",
    restoration_approved_by:         ab,
    restoration_phase:               0,
    incident_id:                     iid || null,
    assurance_status:                ASSURANCE_STATUSES.PENDING,
    assurance_checks:                Array.isArray(assuranceChecks) ? [...assuranceChecks] : [],
    assurance_evidence_ref:          null,
    restoration_governance_version:  RESTORATION_GOVERNANCE_VERSION,
    created_at:                      new Date().toISOString(),
    phase_applied_at:                null,
    assurance_started_at:            null,
    validated_at:                    null,
    completed_at:                    null,
  }
  _restorations.set(id, entry)
  return { ok: true, data: { ...entry } }
}

// ---------------------------------------------------------------------------
// applyRestorationPhase — pending → in_progress; increments phase counter
// ---------------------------------------------------------------------------
function applyRestorationPhase(restorationId) {
  const id    = String(restorationId || "").trim()
  const entry = _restorations.get(id)
  if (!entry) return { ok: false, reason: "unknown_restoration_id" }
  if (entry.restoration_status !== RESTORATION_STATUSES.PENDING) {
    return { ok: false, reason: "invalid_status_for_phase", current_status: entry.restoration_status }
  }
  const updated = {
    ...entry,
    restoration_status: RESTORATION_STATUSES.IN_PROGRESS,
    restoration_phase:  entry.restoration_phase + 1,
    phase_applied_at:   new Date().toISOString(),
  }
  _restorations.set(id, updated)
  return { ok: true, data: { ...updated } }
}

// ---------------------------------------------------------------------------
// startAssurance — log assurance start; requires in_progress status
// ---------------------------------------------------------------------------
function startAssurance(restorationId) {
  const id    = String(restorationId || "").trim()
  const entry = _restorations.get(id)
  if (!entry) return { ok: false, reason: "unknown_restoration_id" }
  if (entry.restoration_status !== RESTORATION_STATUSES.IN_PROGRESS) {
    return { ok: false, reason: "invalid_status_for_assurance", current_status: entry.restoration_status }
  }
  const updated = {
    ...entry,
    assurance_status:     ASSURANCE_STATUSES.PENDING,
    assurance_started_at: new Date().toISOString(),
  }
  _restorations.set(id, updated)
  return { ok: true, data: { ...updated } }
}

// ---------------------------------------------------------------------------
// verifyAssurance — passed → validated; failed → revert to pending
// ---------------------------------------------------------------------------
function verifyAssurance(restorationId, passed, evidenceRef) {
  const id    = String(restorationId || "").trim()
  const entry = _restorations.get(id)
  if (!entry) return { ok: false, reason: "unknown_restoration_id" }
  if (entry.restoration_status !== RESTORATION_STATUSES.IN_PROGRESS) {
    return { ok: false, reason: "invalid_status_for_verification", current_status: entry.restoration_status }
  }
  const er = String(evidenceRef || "").trim()
  if (passed) {
    const updated = {
      ...entry,
      assurance_status:       ASSURANCE_STATUSES.VERIFIED,
      assurance_evidence_ref: er || null,
      restoration_status:     RESTORATION_STATUSES.VALIDATED,
      validated_at:           new Date().toISOString(),
    }
    _restorations.set(id, updated)
    return { ok: true, assurance_passed: true, data: { ...updated } }
  } else {
    // Failed assurance → revert to pending
    const updated = {
      ...entry,
      assurance_status:       ASSURANCE_STATUSES.FAILED,
      assurance_evidence_ref: er || null,
      restoration_status:     RESTORATION_STATUSES.PENDING,  // revert
    }
    _restorations.set(id, updated)
    return { ok: true, assurance_passed: false, data: { ...updated } }
  }
}

// ---------------------------------------------------------------------------
// completeRestoration — validated → completed
// ---------------------------------------------------------------------------
function completeRestoration(restorationId) {
  const id    = String(restorationId || "").trim()
  const entry = _restorations.get(id)
  if (!entry) return { ok: false, reason: "unknown_restoration_id" }
  if (entry.restoration_status !== RESTORATION_STATUSES.VALIDATED) {
    return { ok: false, reason: "assurance_not_verified", current_status: entry.restoration_status }
  }
  const updated = {
    ...entry,
    restoration_status: RESTORATION_STATUSES.COMPLETED,
    completed_at:       new Date().toISOString(),
  }
  _restorations.set(id, updated)
  return { ok: true, data: { ...updated } }
}

// ---------------------------------------------------------------------------
// resolveRestoration — fail-closed on unknown ID
// ---------------------------------------------------------------------------
function resolveRestoration(restorationId) {
  const id = String(restorationId || "").trim()
  if (!id) return { ok: false, reason: "missing_restoration_id" }
  const entry = _restorations.get(id)
  if (!entry) return { ok: false, reason: "unknown_restoration_id", restoration_id: id }
  return { ok: true, restoration: { ...entry } }
}

// ---------------------------------------------------------------------------
// isRestorationValidated — true if restoration is validated or completed
// ---------------------------------------------------------------------------
function isRestorationValidated(restorationId) {
  const id    = String(restorationId || "").trim()
  const entry = _restorations.get(id)
  if (!entry) return false
  return _CLEARED_STATUSES.has(entry.restoration_status)
}

// ---------------------------------------------------------------------------
// getGovernanceState — read-only snapshot
// ---------------------------------------------------------------------------
function getGovernanceState() {
  const restorations = Array.from(_restorations.values()).map(r => ({ ...r }))
  const active = restorations.filter(r =>
    r.restoration_status !== RESTORATION_STATUSES.COMPLETED
  ).length
  return {
    restoration_count:        restorations.length,
    active_restoration_count: active,
    restorations,
  }
}

// ---------------------------------------------------------------------------
// exportGovernance — write JSON artifact (does not mutate state)
// ---------------------------------------------------------------------------
function exportGovernance(outputPath) {
  const state    = getGovernanceState()
  const artifact = {
    exported_at:                   new Date().toISOString(),
    restoration_governance_version: RESTORATION_GOVERNANCE_VERSION,
    restoration_count:             state.restoration_count,
    active_restoration_count:      state.active_restoration_count,
    restorations:                  state.restorations,
  }
  if (outputPath) {
    fs.writeFileSync(outputPath, JSON.stringify(artifact, null, 2) + "\n", "utf8")
  }
  return artifact
}

module.exports = {
  RESTORATION_GOVERNANCE_VERSION,
  RESTORATION_STATUSES,
  ASSURANCE_STATUSES,
  initiateRestoration,
  applyRestorationPhase,
  startAssurance,
  verifyAssurance,
  completeRestoration,
  resolveRestoration,
  isRestorationValidated,
  getGovernanceState,
  exportGovernance,
}
