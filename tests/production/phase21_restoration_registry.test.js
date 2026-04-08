"use strict"

/**
 * Phase 21 — Controlled Service Restoration + Post-Incident Assurance unit tests
 * Framework: node:test + node:assert (native, no dependencies)
 */

const { describe, it, afterEach } = require("node:test")
const assert = require("node:assert/strict")

const {
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
} = require("../../app/lib/restoration_registry")

// ---------------------------------------------------------------------------
// Helpers — track restorations; complete or force-complete to clean up
// ---------------------------------------------------------------------------
const _trackedIds = []
function trackRestoration(result) {
  if (result && result.ok && result.data && result.data.restoration_id) {
    _trackedIds.push(result.data.restoration_id)
  }
  return result
}
function cleanTracked() {
  // Best-effort: drive all tracked restorations to completed
  while (_trackedIds.length) {
    const id = _trackedIds.pop()
    const r = resolveRestoration(id)
    if (!r.ok) continue
    const st = r.restoration.restoration_status
    if (st === "pending")     { applyRestorationPhase(id); verifyAssurance(id, true); completeRestoration(id) }
    else if (st === "in_progress") { verifyAssurance(id, true); completeRestoration(id) }
    else if (st === "validated")   { completeRestoration(id) }
    // completed — nothing to do
  }
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
describe("RESTORATION_GOVERNANCE_VERSION", () => {
  it("exports a non-empty string", () => {
    assert.equal(typeof RESTORATION_GOVERNANCE_VERSION, "string")
    assert.ok(RESTORATION_GOVERNANCE_VERSION.length > 0)
  })
})

describe("RESTORATION_STATUSES", () => {
  it("has pending, in_progress, validated, completed", () => {
    assert.equal(RESTORATION_STATUSES.PENDING,     "pending")
    assert.equal(RESTORATION_STATUSES.IN_PROGRESS, "in_progress")
    assert.equal(RESTORATION_STATUSES.VALIDATED,   "validated")
    assert.equal(RESTORATION_STATUSES.COMPLETED,   "completed")
    assert.equal(Object.keys(RESTORATION_STATUSES).length, 4)
  })
})

describe("ASSURANCE_STATUSES", () => {
  it("has pending, verified, failed", () => {
    assert.equal(ASSURANCE_STATUSES.PENDING,  "pending")
    assert.equal(ASSURANCE_STATUSES.VERIFIED, "verified")
    assert.equal(ASSURANCE_STATUSES.FAILED,   "failed")
  })
})

// ---------------------------------------------------------------------------
// initiateRestoration
// ---------------------------------------------------------------------------
describe("initiateRestoration", () => {
  afterEach(() => cleanTracked())

  it("creates a pending restoration with required fields", () => {
    const r = trackRestoration(initiateRestoration({ scope: "auth-service", approvedBy: "admin-sa" }))
    assert.equal(r.ok, true)
    assert.ok(r.data.restoration_id.startsWith("rest_"))
    assert.equal(r.data.restoration_status,      RESTORATION_STATUSES.PENDING)
    assert.equal(r.data.restoration_approved_by, "admin-sa")
    assert.equal(r.data.restoration_scope,       "auth-service")
    assert.equal(r.data.assurance_status,        ASSURANCE_STATUSES.PENDING)
    assert.equal(r.data.restoration_phase,       0)
    assert.ok(r.data.created_at)
    assert.equal(r.data.validated_at, null)
    assert.equal(r.data.completed_at, null)
  })
  it("rejects missing approved_by", () => {
    const r = initiateRestoration({ scope: "auth-service", approvedBy: "" })
    assert.equal(r.ok, false)
    assert.equal(r.reason, "missing_approval")
  })
  it("rejects null approved_by", () => {
    const r = initiateRestoration({ scope: "auth-service" })
    assert.equal(r.ok, false)
    assert.equal(r.reason, "missing_approval")
  })
  it("defaults scope to 'general'", () => {
    const r = trackRestoration(initiateRestoration({ approvedBy: "admin" }))
    assert.equal(r.ok, true)
    assert.equal(r.data.restoration_scope, "general")
  })
  it("generates unique restoration IDs", () => {
    const r1 = trackRestoration(initiateRestoration({ approvedBy: "admin" }))
    const r2 = trackRestoration(initiateRestoration({ approvedBy: "admin" }))
    assert.notEqual(r1.data.restoration_id, r2.data.restoration_id)
  })
})

// ---------------------------------------------------------------------------
// applyRestorationPhase
// ---------------------------------------------------------------------------
describe("applyRestorationPhase", () => {
  afterEach(() => cleanTracked())

  it("transitions pending to in_progress and increments phase", () => {
    const r   = trackRestoration(initiateRestoration({ approvedBy: "admin" }))
    const res = applyRestorationPhase(r.data.restoration_id)
    assert.equal(res.ok, true)
    assert.equal(res.data.restoration_status, RESTORATION_STATUSES.IN_PROGRESS)
    assert.equal(res.data.restoration_phase,  1)
    assert.ok(res.data.phase_applied_at)
  })
  it("fails for unknown restoration id", () => {
    const res = applyRestorationPhase("rest_nonexistent")
    assert.equal(res.ok, false)
    assert.equal(res.reason, "unknown_restoration_id")
  })
  it("fails if not in pending status", () => {
    const r = trackRestoration(initiateRestoration({ approvedBy: "admin" }))
    applyRestorationPhase(r.data.restoration_id)
    // Now in_progress — can't apply phase again
    const res = applyRestorationPhase(r.data.restoration_id)
    assert.equal(res.ok, false)
    assert.equal(res.reason, "invalid_status_for_phase")
  })
})

// ---------------------------------------------------------------------------
// startAssurance
// ---------------------------------------------------------------------------
describe("startAssurance", () => {
  afterEach(() => cleanTracked())

  it("marks assurance as started on in_progress restoration", () => {
    const r = trackRestoration(initiateRestoration({ approvedBy: "admin" }))
    applyRestorationPhase(r.data.restoration_id)
    const res = startAssurance(r.data.restoration_id)
    assert.equal(res.ok, true)
    assert.ok(res.data.assurance_started_at)
  })
  it("fails for unknown id", () => {
    const res = startAssurance("rest_nonexistent")
    assert.equal(res.ok, false)
    assert.equal(res.reason, "unknown_restoration_id")
  })
  it("fails if not in_progress", () => {
    const r = trackRestoration(initiateRestoration({ approvedBy: "admin" }))
    const res = startAssurance(r.data.restoration_id)
    assert.equal(res.ok, false)
    assert.equal(res.reason, "invalid_status_for_assurance")
  })
})

// ---------------------------------------------------------------------------
// verifyAssurance
// ---------------------------------------------------------------------------
describe("verifyAssurance", () => {
  afterEach(() => cleanTracked())

  it("passed=true → validated status + verified assurance", () => {
    const r = trackRestoration(initiateRestoration({ approvedBy: "admin" }))
    applyRestorationPhase(r.data.restoration_id)
    const res = verifyAssurance(r.data.restoration_id, true, "evidence-ref-001")
    assert.equal(res.ok, true)
    assert.equal(res.assurance_passed, true)
    assert.equal(res.data.restoration_status, RESTORATION_STATUSES.VALIDATED)
    assert.equal(res.data.assurance_status,   ASSURANCE_STATUSES.VERIFIED)
    assert.ok(res.data.validated_at)
    assert.equal(res.data.assurance_evidence_ref, "evidence-ref-001")
  })
  it("passed=false → reverts to pending + failed assurance", () => {
    const r = trackRestoration(initiateRestoration({ approvedBy: "admin" }))
    applyRestorationPhase(r.data.restoration_id)
    const res = verifyAssurance(r.data.restoration_id, false, "failure-ref")
    assert.equal(res.ok, true)
    assert.equal(res.assurance_passed, false)
    assert.equal(res.data.restoration_status, RESTORATION_STATUSES.PENDING)
    assert.equal(res.data.assurance_status,   ASSURANCE_STATUSES.FAILED)
  })
  it("fails for unknown id", () => {
    const res = verifyAssurance("rest_nonexistent", true)
    assert.equal(res.ok, false)
    assert.equal(res.reason, "unknown_restoration_id")
  })
  it("fails if not in_progress", () => {
    const r = trackRestoration(initiateRestoration({ approvedBy: "admin" }))
    const res = verifyAssurance(r.data.restoration_id, true)
    assert.equal(res.ok, false)
    assert.equal(res.reason, "invalid_status_for_verification")
  })
})

// ---------------------------------------------------------------------------
// completeRestoration
// ---------------------------------------------------------------------------
describe("completeRestoration", () => {
  afterEach(() => cleanTracked())

  it("transitions validated to completed", () => {
    const r = trackRestoration(initiateRestoration({ approvedBy: "admin" }))
    applyRestorationPhase(r.data.restoration_id)
    verifyAssurance(r.data.restoration_id, true)
    const res = completeRestoration(r.data.restoration_id)
    assert.equal(res.ok, true)
    assert.equal(res.data.restoration_status, RESTORATION_STATUSES.COMPLETED)
    assert.ok(res.data.completed_at)
  })
  it("fails for unknown id", () => {
    const res = completeRestoration("rest_nonexistent")
    assert.equal(res.ok, false)
    assert.equal(res.reason, "unknown_restoration_id")
  })
  it("fails if assurance not verified (pending status)", () => {
    const r = trackRestoration(initiateRestoration({ approvedBy: "admin" }))
    const res = completeRestoration(r.data.restoration_id)
    assert.equal(res.ok, false)
    assert.equal(res.reason, "assurance_not_verified")
  })
  it("fails if assurance failed (reverted to pending)", () => {
    const r = trackRestoration(initiateRestoration({ approvedBy: "admin" }))
    applyRestorationPhase(r.data.restoration_id)
    verifyAssurance(r.data.restoration_id, false)
    const res = completeRestoration(r.data.restoration_id)
    assert.equal(res.ok, false)
    assert.equal(res.reason, "assurance_not_verified")
  })
})

// ---------------------------------------------------------------------------
// resolveRestoration
// ---------------------------------------------------------------------------
describe("resolveRestoration", () => {
  afterEach(() => cleanTracked())

  it("returns ok:true for existing restoration", () => {
    const r = trackRestoration(initiateRestoration({ approvedBy: "admin" }))
    const res = resolveRestoration(r.data.restoration_id)
    assert.equal(res.ok, true)
    assert.ok(res.restoration)
  })
  it("fails for unknown id", () => {
    const res = resolveRestoration("rest_nonexistent")
    assert.equal(res.ok, false)
    assert.equal(res.reason, "unknown_restoration_id")
  })
  it("fails for empty id", () => {
    const res = resolveRestoration("")
    assert.equal(res.ok, false)
    assert.equal(res.reason, "missing_restoration_id")
  })
  it("fails for null id", () => {
    const res = resolveRestoration(null)
    assert.equal(res.ok, false)
    assert.equal(res.reason, "missing_restoration_id")
  })
})

// ---------------------------------------------------------------------------
// isRestorationValidated
// ---------------------------------------------------------------------------
describe("isRestorationValidated", () => {
  afterEach(() => cleanTracked())

  it("returns false for pending restoration", () => {
    const r = trackRestoration(initiateRestoration({ approvedBy: "admin" }))
    assert.equal(isRestorationValidated(r.data.restoration_id), false)
  })
  it("returns false for in_progress restoration", () => {
    const r = trackRestoration(initiateRestoration({ approvedBy: "admin" }))
    applyRestorationPhase(r.data.restoration_id)
    assert.equal(isRestorationValidated(r.data.restoration_id), false)
  })
  it("returns true for validated restoration", () => {
    const r = trackRestoration(initiateRestoration({ approvedBy: "admin" }))
    applyRestorationPhase(r.data.restoration_id)
    verifyAssurance(r.data.restoration_id, true)
    assert.equal(isRestorationValidated(r.data.restoration_id), true)
  })
  it("returns true for completed restoration", () => {
    const r = trackRestoration(initiateRestoration({ approvedBy: "admin" }))
    applyRestorationPhase(r.data.restoration_id)
    verifyAssurance(r.data.restoration_id, true)
    completeRestoration(r.data.restoration_id)
    assert.equal(isRestorationValidated(r.data.restoration_id), true)
  })
  it("returns false for unknown id", () => {
    assert.equal(isRestorationValidated("rest_nonexistent"), false)
  })
})

// ---------------------------------------------------------------------------
// getGovernanceState + exportGovernance
// ---------------------------------------------------------------------------
describe("getGovernanceState", () => {
  it("returns required fields", () => {
    const s = getGovernanceState()
    assert.ok(typeof s.restoration_count === "number")
    assert.ok(typeof s.active_restoration_count === "number")
    assert.ok(Array.isArray(s.restorations))
  })
  it("returns snapshots (not references)", () => {
    const s1 = getGovernanceState()
    const s2 = getGovernanceState()
    assert.notEqual(s1, s2)
  })
})

describe("exportGovernance", () => {
  it("returns artifact with required fields", () => {
    const a = exportGovernance()
    assert.ok(a.exported_at)
    assert.ok(a.restoration_governance_version)
    assert.ok(typeof a.restoration_count === "number")
    assert.ok(typeof a.active_restoration_count === "number")
    assert.ok(Array.isArray(a.restorations))
  })
  it("does not mutate state", () => {
    const a1 = exportGovernance()
    const a2 = exportGovernance()
    assert.equal(a1.restoration_governance_version, a2.restoration_governance_version)
  })
})
