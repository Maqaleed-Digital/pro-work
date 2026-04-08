"use strict"

/**
 * Phase 17 — Regulatory Disclosure + Legal Hold Governance unit tests
 * Framework: node:test + node:assert (native, no dependencies)
 */

const { describe, it, before, afterEach } = require("node:test")
const assert = require("node:assert/strict")

const {
  DISCLOSURE_GOVERNANCE_VERSION,
  DISCLOSURE_BASES,
  DISCLOSURE_SCOPES,
  LEGAL_HOLD_STATES,
  resolveDisclosureBasis,
  validateDisclosureScope,
  validateLegalHoldState,
  createLegalHold,
  hasActiveLegalHold,
  getLegalHoldsForTenant,
  releaseLegalHold,
  getGovernanceState,
  exportGovernance,
} = require("../../app/lib/disclosure_legal_hold")

// ---------------------------------------------------------------------------
// Helpers to clear in-module _legalHolds between tests
// ---------------------------------------------------------------------------
// We access the private map via the module cache for isolation
const mod = require("../../app/lib/disclosure_legal_hold")
function clearHolds() {
  // reach into module internals via a small backdoor: call getGovernanceState
  // then release every active hold by re-requiring with fresh module cache
  // Since we can't easily clear in-memory state without exposing it,
  // instead we track hold IDs we created and release them in afterEach
}
const _createdHoldIds = []
function trackHold(result) {
  if (result && result.ok && result.data && result.data.legal_hold_id) {
    _createdHoldIds.push(result.data.legal_hold_id)
  }
  return result
}
function releaseTracked() {
  while (_createdHoldIds.length) {
    const id = _createdHoldIds.pop()
    releaseLegalHold(id)
  }
}

// ---------------------------------------------------------------------------
// DISCLOSURE_GOVERNANCE_VERSION
// ---------------------------------------------------------------------------
describe("DISCLOSURE_GOVERNANCE_VERSION", () => {
  it("exports version string", () => {
    assert.equal(typeof DISCLOSURE_GOVERNANCE_VERSION, "string")
    assert.ok(DISCLOSURE_GOVERNANCE_VERSION.length > 0)
  })
})

// ---------------------------------------------------------------------------
// DISCLOSURE_BASES catalog
// ---------------------------------------------------------------------------
describe("DISCLOSURE_BASES catalog", () => {
  it("contains exactly three bases", () => {
    assert.equal(Object.keys(DISCLOSURE_BASES).length, 3)
  })
  it("regulatory.request is active", () => {
    assert.equal(DISCLOSURE_BASES["regulatory.request"].status, "active")
  })
  it("customer.disclosure is active", () => {
    assert.equal(DISCLOSURE_BASES["customer.disclosure"].status, "active")
  })
  it("internal.audit.review is active", () => {
    assert.equal(DISCLOSURE_BASES["internal.audit.review"].status, "active")
  })
  it("each basis has required fields", () => {
    for (const [key, entry] of Object.entries(DISCLOSURE_BASES)) {
      assert.equal(entry.basis, key)
      assert.ok(entry.name)
      assert.ok(entry.policy_version)
      assert.ok(entry.description)
    }
  })
})

// ---------------------------------------------------------------------------
// DISCLOSURE_SCOPES catalog
// ---------------------------------------------------------------------------
describe("DISCLOSURE_SCOPES catalog", () => {
  it("contains exactly three scopes", () => {
    assert.equal(Object.keys(DISCLOSURE_SCOPES).length, 3)
  })
  it("audit_records scope exists", () => {
    assert.ok(DISCLOSURE_SCOPES["audit_records"])
  })
  it("approval_records scope exists", () => {
    assert.ok(DISCLOSURE_SCOPES["approval_records"])
  })
  it("full_export scope exists", () => {
    assert.ok(DISCLOSURE_SCOPES["full_export"])
  })
})

// ---------------------------------------------------------------------------
// LEGAL_HOLD_STATES
// ---------------------------------------------------------------------------
describe("LEGAL_HOLD_STATES", () => {
  it("has NONE, ACTIVE, RELEASED", () => {
    assert.equal(LEGAL_HOLD_STATES.NONE,     "none")
    assert.equal(LEGAL_HOLD_STATES.ACTIVE,   "active")
    assert.equal(LEGAL_HOLD_STATES.RELEASED, "released")
  })
})

// ---------------------------------------------------------------------------
// resolveDisclosureBasis
// ---------------------------------------------------------------------------
describe("resolveDisclosureBasis", () => {
  it("returns ok:true for known active basis", () => {
    const r = resolveDisclosureBasis("regulatory.request")
    assert.equal(r.ok, true)
    assert.ok(r.entry)
  })
  it("returns ok:false for unknown basis", () => {
    const r = resolveDisclosureBasis("unknown.basis")
    assert.equal(r.ok, false)
    assert.equal(r.reason, "unknown_basis")
  })
  it("returns ok:false for empty basis", () => {
    const r = resolveDisclosureBasis("")
    assert.equal(r.ok, false)
    assert.equal(r.reason, "unknown_basis")
  })
  it("returns ok:false for null basis", () => {
    const r = resolveDisclosureBasis(null)
    assert.equal(r.ok, false)
    assert.equal(r.reason, "unknown_basis")
  })
  it("works for customer.disclosure", () => {
    const r = resolveDisclosureBasis("customer.disclosure")
    assert.equal(r.ok, true)
  })
  it("works for internal.audit.review", () => {
    const r = resolveDisclosureBasis("internal.audit.review")
    assert.equal(r.ok, true)
  })
})

// ---------------------------------------------------------------------------
// validateDisclosureScope
// ---------------------------------------------------------------------------
describe("validateDisclosureScope", () => {
  it("regulatory.request + full_export → in_scope", () => {
    const r = validateDisclosureScope("regulatory.request", "full_export")
    assert.equal(r.ok, true)
  })
  it("regulatory.request + audit_records → in_scope", () => {
    const r = validateDisclosureScope("regulatory.request", "audit_records")
    assert.equal(r.ok, true)
  })
  it("customer.disclosure + approval_records → in_scope", () => {
    const r = validateDisclosureScope("customer.disclosure", "approval_records")
    assert.equal(r.ok, true)
  })
  it("customer.disclosure + full_export → out_of_scope", () => {
    const r = validateDisclosureScope("customer.disclosure", "full_export")
    assert.equal(r.ok, false)
    assert.equal(r.reason, "out_of_scope")
  })
  it("internal.audit.review + audit_records → in_scope", () => {
    const r = validateDisclosureScope("internal.audit.review", "audit_records")
    assert.equal(r.ok, true)
  })
  it("internal.audit.review + full_export → out_of_scope", () => {
    const r = validateDisclosureScope("internal.audit.review", "full_export")
    assert.equal(r.ok, false)
    assert.equal(r.reason, "out_of_scope")
  })
  it("internal.audit.review + approval_records → out_of_scope", () => {
    const r = validateDisclosureScope("internal.audit.review", "approval_records")
    assert.equal(r.ok, false)
    assert.equal(r.reason, "out_of_scope")
  })
  it("unknown scope → unknown_scope", () => {
    const r = validateDisclosureScope("regulatory.request", "unknown_scope_val")
    assert.equal(r.ok, false)
    assert.equal(r.reason, "unknown_scope")
  })
  it("empty scope → unknown_scope", () => {
    const r = validateDisclosureScope("regulatory.request", "")
    assert.equal(r.ok, false)
    assert.equal(r.reason, "unknown_scope")
  })
  it("unknown basis → unknown_basis", () => {
    const r = validateDisclosureScope("unknown.basis", "audit_records")
    assert.equal(r.ok, false)
    assert.equal(r.reason, "unknown_basis")
  })
})

// ---------------------------------------------------------------------------
// validateLegalHoldState
// ---------------------------------------------------------------------------
describe("validateLegalHoldState", () => {
  it("accepts 'none'", () => {
    const r = validateLegalHoldState("none")
    assert.equal(r.ok, true)
    assert.equal(r.state, "none")
  })
  it("accepts 'active'", () => {
    const r = validateLegalHoldState("active")
    assert.equal(r.ok, true)
  })
  it("accepts 'released'", () => {
    const r = validateLegalHoldState("released")
    assert.equal(r.ok, true)
  })
  it("case-normalizes to lowercase", () => {
    const r = validateLegalHoldState("ACTIVE")
    assert.equal(r.ok, true)
    assert.equal(r.state, "active")
  })
  it("rejects unknown state", () => {
    const r = validateLegalHoldState("suspended")
    assert.equal(r.ok, false)
    assert.equal(r.reason, "unknown_hold_state")
  })
  it("rejects empty string", () => {
    const r = validateLegalHoldState("")
    assert.equal(r.ok, false)
    assert.equal(r.reason, "unknown_hold_state")
  })
  it("rejects null", () => {
    const r = validateLegalHoldState(null)
    assert.equal(r.ok, false)
    assert.equal(r.reason, "unknown_hold_state")
  })
})

// ---------------------------------------------------------------------------
// createLegalHold
// ---------------------------------------------------------------------------
describe("createLegalHold", () => {
  afterEach(() => releaseTracked())

  it("creates hold with full_export scope by default", () => {
    const r = trackHold(createLegalHold({ tenantId: "t1" }))
    assert.equal(r.ok, true)
    assert.ok(r.data.legal_hold_id)
    assert.equal(r.data.tenant_id, "t1")
    assert.equal(r.data.scope, "full_export")
    assert.equal(r.data.status, LEGAL_HOLD_STATES.ACTIVE)
    assert.ok(r.data.created_at)
    assert.equal(r.data.released_at, null)
  })
  it("creates hold with specified scope", () => {
    const r = trackHold(createLegalHold({ tenantId: "t2", scope: "audit_records" }))
    assert.equal(r.ok, true)
    assert.equal(r.data.scope, "audit_records")
  })
  it("rejects unknown scope", () => {
    const r = createLegalHold({ tenantId: "t3", scope: "bad_scope" })
    assert.equal(r.ok, false)
    assert.equal(r.reason, "unknown_scope")
  })
  it("rejects missing tenantId", () => {
    const r = createLegalHold({ tenantId: "", scope: "audit_records" })
    assert.equal(r.ok, false)
    assert.equal(r.reason, "missing_tenant_id")
  })
  it("stores note field", () => {
    const r = trackHold(createLegalHold({ tenantId: "t4", note: "test note" }))
    assert.equal(r.ok, true)
    assert.equal(r.data.note, "test note")
  })
  it("generates unique IDs for each hold", () => {
    const r1 = trackHold(createLegalHold({ tenantId: "t5" }))
    const r2 = trackHold(createLegalHold({ tenantId: "t5" }))
    assert.notEqual(r1.data.legal_hold_id, r2.data.legal_hold_id)
  })
})

// ---------------------------------------------------------------------------
// hasActiveLegalHold + getLegalHoldsForTenant
// ---------------------------------------------------------------------------
describe("hasActiveLegalHold / getLegalHoldsForTenant", () => {
  afterEach(() => releaseTracked())

  it("returns false when no hold exists for tenant", () => {
    assert.equal(hasActiveLegalHold("no-hold-tenant"), false)
  })
  it("returns true when active hold exists", () => {
    trackHold(createLegalHold({ tenantId: "hold-tenant" }))
    assert.equal(hasActiveLegalHold("hold-tenant"), true)
  })
  it("returns false after all holds released", () => {
    const r = trackHold(createLegalHold({ tenantId: "release-tenant" }))
    releaseLegalHold(r.data.legal_hold_id)
    // remove from tracked since already released
    const idx = _createdHoldIds.indexOf(r.data.legal_hold_id)
    if (idx !== -1) _createdHoldIds.splice(idx, 1)
    assert.equal(hasActiveLegalHold("release-tenant"), false)
  })
  it("getLegalHoldsForTenant returns all holds for tenant", () => {
    const r1 = trackHold(createLegalHold({ tenantId: "multi-hold" }))
    const r2 = trackHold(createLegalHold({ tenantId: "multi-hold" }))
    const holds = getLegalHoldsForTenant("multi-hold")
    const ids = holds.map(h => h.legal_hold_id)
    assert.ok(ids.includes(r1.data.legal_hold_id))
    assert.ok(ids.includes(r2.data.legal_hold_id))
  })
  it("getLegalHoldsForTenant returns empty for unknown tenant", () => {
    assert.deepEqual(getLegalHoldsForTenant("nobody"), [])
  })
})

// ---------------------------------------------------------------------------
// releaseLegalHold
// ---------------------------------------------------------------------------
describe("releaseLegalHold", () => {
  afterEach(() => releaseTracked())

  it("transitions active hold to released", () => {
    const r = trackHold(createLegalHold({ tenantId: "rel-tenant" }))
    const rel = releaseLegalHold(r.data.legal_hold_id)
    assert.equal(rel.ok, true)
    assert.equal(rel.data.status, LEGAL_HOLD_STATES.RELEASED)
    assert.ok(rel.data.released_at)
  })
  it("fails for unknown hold id", () => {
    const r = releaseLegalHold("lh_nonexistent")
    assert.equal(r.ok, false)
    assert.equal(r.reason, "unknown_hold_id")
  })
  it("fails if already released", () => {
    const r = trackHold(createLegalHold({ tenantId: "double-rel" }))
    releaseLegalHold(r.data.legal_hold_id)
    const r2 = releaseLegalHold(r.data.legal_hold_id)
    assert.equal(r2.ok, false)
    assert.equal(r2.reason, "already_released")
  })
})

// ---------------------------------------------------------------------------
// getGovernanceState
// ---------------------------------------------------------------------------
describe("getGovernanceState", () => {
  it("returns bases, scopes, and legal_holds arrays", () => {
    const s = getGovernanceState()
    assert.ok(Array.isArray(s.bases))
    assert.ok(Array.isArray(s.scopes))
    assert.ok(Array.isArray(s.legal_holds))
  })
  it("returns 3 bases", () => {
    const s = getGovernanceState()
    assert.equal(s.bases.length, 3)
  })
  it("returns 3 scopes", () => {
    const s = getGovernanceState()
    assert.equal(s.scopes.length, 3)
  })
  it("returns snapshots (not references)", () => {
    const s1 = getGovernanceState()
    const s2 = getGovernanceState()
    assert.notEqual(s1, s2)
    assert.notEqual(s1.bases, s2.bases)
  })
})

// ---------------------------------------------------------------------------
// exportGovernance
// ---------------------------------------------------------------------------
describe("exportGovernance", () => {
  it("returns artifact with required fields", () => {
    const a = exportGovernance()
    assert.ok(a.exported_at)
    assert.ok(a.disclosure_governance_version)
    assert.ok(typeof a.disclosure_basis_count === "number")
    assert.ok(typeof a.disclosure_scope_count === "number")
    assert.ok(typeof a.legal_hold_count === "number")
    assert.ok(typeof a.active_hold_count === "number")
    assert.ok(Array.isArray(a.disclosure_bases))
    assert.ok(Array.isArray(a.disclosure_scopes))
    assert.ok(Array.isArray(a.legal_holds))
  })
  it("basis count matches catalog", () => {
    const a = exportGovernance()
    assert.equal(a.disclosure_basis_count, Object.keys(DISCLOSURE_BASES).length)
  })
  it("scope count matches catalog", () => {
    const a = exportGovernance()
    assert.equal(a.disclosure_scope_count, Object.keys(DISCLOSURE_SCOPES).length)
  })
  it("does not mutate state (returns same count on repeated calls)", () => {
    const a1 = exportGovernance()
    const a2 = exportGovernance()
    assert.equal(a1.disclosure_basis_count, a2.disclosure_basis_count)
  })
})
