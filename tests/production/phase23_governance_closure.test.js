"use strict"

/**
 * Phase 23 — Governance Closure + Executive Assurance Pack unit tests
 * Framework: node:test + node:assert (native, no dependencies)
 */

const { describe, it } = require("node:test")
const assert = require("node:assert/strict")

const {
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
} = require("../../app/lib/governance_closure")

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function makeClosure(overrides) {
  return createClosure({
    scope: "global",
    closureStatus: "ready",
    criticalEvidenceRefs: ["ev-001"],
    ...overrides,
  })
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
describe("GOVERNANCE_CLOSURE_VERSION", () => {
  it("exports a non-empty string", () => {
    assert.equal(typeof GOVERNANCE_CLOSURE_VERSION, "string")
    assert.ok(GOVERNANCE_CLOSURE_VERSION.length > 0)
  })
})

describe("CLOSURE_STATUSES", () => {
  it("has ready, blocked, incomplete, closed", () => {
    assert.equal(CLOSURE_STATUSES.READY,      "ready")
    assert.equal(CLOSURE_STATUSES.BLOCKED,    "blocked")
    assert.equal(CLOSURE_STATUSES.INCOMPLETE, "incomplete")
    assert.equal(CLOSURE_STATUSES.CLOSED,     "closed")
    assert.equal(Object.keys(CLOSURE_STATUSES).length, 4)
  })
})

describe("ASSURANCE_STATUSES", () => {
  it("has draft, validated, blocked, issued", () => {
    assert.equal(ASSURANCE_STATUSES.DRAFT,     "draft")
    assert.equal(ASSURANCE_STATUSES.VALIDATED, "validated")
    assert.equal(ASSURANCE_STATUSES.BLOCKED,   "blocked")
    assert.equal(ASSURANCE_STATUSES.ISSUED,    "issued")
    assert.equal(Object.keys(ASSURANCE_STATUSES).length, 4)
  })
})

// ---------------------------------------------------------------------------
// createClosure
// ---------------------------------------------------------------------------
describe("createClosure", () => {
  it("creates a ready closure with required fields", () => {
    const r = makeClosure()
    assert.equal(r.ok, true)
    assert.ok(r.data.closure_id.startsWith("cls_"))
    assert.equal(r.data.closure_status, "ready")
    assert.ok(r.data.closure_generated_at)
    assert.deepEqual(r.data.critical_evidence_refs, ["ev-001"])
  })
  it("creates a blocked closure (no evidence required)", () => {
    const r = createClosure({ closureStatus: "blocked", scope: "global" })
    assert.equal(r.ok, true)
    assert.equal(r.data.closure_status, "blocked")
  })
  it("creates an incomplete closure (no evidence required)", () => {
    const r = createClosure({ closureStatus: "incomplete", scope: "global" })
    assert.equal(r.ok, true)
    assert.equal(r.data.closure_status, "incomplete")
  })
  it("creates a closed closure with evidence", () => {
    const r = createClosure({ closureStatus: "closed", criticalEvidenceRefs: ["ev-close-001"], scope: "global" })
    assert.equal(r.ok, true)
    assert.equal(r.data.closure_status, "closed")
  })
  it("rejects unknown closure_status", () => {
    const r = createClosure({ closureStatus: "unknown_val", scope: "global" })
    assert.equal(r.ok, false)
    assert.equal(r.reason, "unknown_closure_status")
  })
  it("rejects missing closure_status", () => {
    const r = createClosure({ scope: "global" })
    assert.equal(r.ok, false)
    assert.equal(r.reason, "unknown_closure_status")
  })
  it("rejects ready without criticalEvidenceRefs", () => {
    const r = createClosure({ closureStatus: "ready", scope: "global" })
    assert.equal(r.ok, false)
    assert.equal(r.reason, "missing_critical_evidence")
  })
  it("rejects closed without criticalEvidenceRefs", () => {
    const r = createClosure({ closureStatus: "closed", criticalEvidenceRefs: [], scope: "global" })
    assert.equal(r.ok, false)
    assert.equal(r.reason, "missing_critical_evidence")
  })
  it("defaults scope to 'global'", () => {
    const r = makeClosure({ scope: undefined })
    assert.equal(r.ok, true)
    assert.equal(r.data.closure_scope, "global")
  })
  it("preserves tenant_id and jurisdiction_code", () => {
    const r = makeClosure({ tenantId: "t_001", jurisdictionCode: "KSA" })
    assert.equal(r.ok, true)
    assert.equal(r.data.tenant_id,        "t_001")
    assert.equal(r.data.jurisdiction_code, "KSA")
  })
  it("generates unique closure IDs", () => {
    const a = makeClosure()
    const b = makeClosure()
    assert.notEqual(a.data.closure_id, b.data.closure_id)
  })
})

// ---------------------------------------------------------------------------
// resolveClosure
// ---------------------------------------------------------------------------
describe("resolveClosure", () => {
  it("returns ok:true for a known closure_id", () => {
    const c = makeClosure()
    const r = resolveClosure(c.data.closure_id)
    assert.equal(r.ok, true)
    assert.equal(r.closure.closure_id, c.data.closure_id)
  })
  it("fails for unknown closure_id", () => {
    const r = resolveClosure("cls_nonexistent")
    assert.equal(r.ok, false)
    assert.equal(r.reason, "unknown_closure_id")
  })
  it("fails for empty closure_id", () => {
    const r = resolveClosure("")
    assert.equal(r.ok, false)
    assert.equal(r.reason, "missing_closure_id")
  })
  it("fails for null closure_id", () => {
    const r = resolveClosure(null)
    assert.equal(r.ok, false)
    assert.equal(r.reason, "missing_closure_id")
  })
})

// ---------------------------------------------------------------------------
// getClosuresForTenant / getClosuresForJurisdiction
// ---------------------------------------------------------------------------
describe("getClosuresForTenant", () => {
  it("returns ok:true with tenant-filtered closures", () => {
    makeClosure({ tenantId: "t_filter_001" })
    const r = getClosuresForTenant("t_filter_001")
    assert.equal(r.ok, true)
    assert.ok(r.data.closures.length >= 1)
    assert.equal(r.data.tenant_id, "t_filter_001")
  })
  it("fails for empty tenant_id", () => {
    const r = getClosuresForTenant("")
    assert.equal(r.ok, false)
    assert.equal(r.reason, "missing_tenant_id")
  })
})

describe("getClosuresForJurisdiction", () => {
  it("returns ok:true with jurisdiction-filtered closures", () => {
    makeClosure({ jurisdictionCode: "GCC" })
    const r = getClosuresForJurisdiction("GCC")
    assert.equal(r.ok, true)
    assert.ok(r.data.closures.length >= 1)
    assert.equal(r.data.jurisdiction_code, "GCC")
  })
  it("fails for empty jurisdiction_code", () => {
    const r = getClosuresForJurisdiction("")
    assert.equal(r.ok, false)
    assert.equal(r.reason, "missing_jurisdiction_code")
  })
})

// ---------------------------------------------------------------------------
// createAssurancePack
// ---------------------------------------------------------------------------
describe("createAssurancePack", () => {
  it("creates a draft assurance pack for a valid closure", () => {
    const c = makeClosure()
    const r = createAssurancePack({ closureId: c.data.closure_id, assuranceStatus: "draft" })
    assert.equal(r.ok, true)
    assert.ok(r.data.assurance_pack_id.startsWith("acp_"))
    assert.equal(r.data.assurance_status, "draft")
    assert.equal(r.data.closure_id,       c.data.closure_id)
    assert.ok(r.data.assurance_generated_at)
  })
  it("creates a validated assurance pack", () => {
    const c = makeClosure()
    const r = createAssurancePack({ closureId: c.data.closure_id, assuranceStatus: "validated" })
    assert.equal(r.ok, true)
    assert.equal(r.data.assurance_status, "validated")
  })
  it("creates a blocked assurance pack", () => {
    const c = makeClosure({ closureStatus: "blocked" })
    const r = createAssurancePack({ closureId: c.data.closure_id, assuranceStatus: "blocked" })
    assert.equal(r.ok, true)
    assert.equal(r.data.assurance_status, "blocked")
  })
  it("creates an issued assurance pack", () => {
    const c = makeClosure({ closureStatus: "closed", criticalEvidenceRefs: ["ev-final-001"] })
    const r = createAssurancePack({ closureId: c.data.closure_id, assuranceStatus: "issued" })
    assert.equal(r.ok, true)
    assert.equal(r.data.assurance_status, "issued")
  })
  it("rejects missing closure_id", () => {
    const r = createAssurancePack({ assuranceStatus: "draft" })
    assert.equal(r.ok, false)
    assert.equal(r.reason, "missing_closure_id")
  })
  it("rejects unknown closure_id", () => {
    const r = createAssurancePack({ closureId: "cls_nonexistent", assuranceStatus: "draft" })
    assert.equal(r.ok, false)
    assert.equal(r.reason, "unknown_closure_id")
  })
  it("rejects unknown assurance_status", () => {
    const c = makeClosure()
    const r = createAssurancePack({ closureId: c.data.closure_id, assuranceStatus: "invalid_val" })
    assert.equal(r.ok, false)
    assert.equal(r.reason, "unknown_assurance_status")
  })
  it("rejects missing assurance_status", () => {
    const c = makeClosure()
    const r = createAssurancePack({ closureId: c.data.closure_id })
    assert.equal(r.ok, false)
    assert.equal(r.reason, "unknown_assurance_status")
  })
})

// ---------------------------------------------------------------------------
// resolveAssurancePack
// ---------------------------------------------------------------------------
describe("resolveAssurancePack", () => {
  it("returns ok:true for a known assurance_pack_id", () => {
    const c = makeClosure()
    const p = createAssurancePack({ closureId: c.data.closure_id, assuranceStatus: "draft" })
    const r = resolveAssurancePack(p.data.assurance_pack_id)
    assert.equal(r.ok, true)
    assert.equal(r.assurance_pack.assurance_pack_id, p.data.assurance_pack_id)
  })
  it("fails for unknown assurance_pack_id", () => {
    const r = resolveAssurancePack("acp_nonexistent")
    assert.equal(r.ok, false)
    assert.equal(r.reason, "unknown_assurance_pack_id")
  })
  it("fails for empty assurance_pack_id", () => {
    const r = resolveAssurancePack("")
    assert.equal(r.ok, false)
    assert.equal(r.reason, "missing_assurance_pack_id")
  })
})

// ---------------------------------------------------------------------------
// getClosureState + exportClosures
// ---------------------------------------------------------------------------
describe("getClosureState", () => {
  it("returns required fields", () => {
    const s = getClosureState()
    assert.ok(typeof s.closure_count === "number")
    assert.ok(Array.isArray(s.closures))
    assert.ok(typeof s.by_status === "object")
  })
  it("returns snapshots (not references)", () => {
    const s1 = getClosureState()
    const s2 = getClosureState()
    assert.notEqual(s1, s2)
  })
})

describe("exportClosures", () => {
  it("returns artifact with required fields", () => {
    const a = exportClosures()
    assert.ok(a.exported_at)
    assert.ok(a.governance_closure_version)
    assert.ok(typeof a.closure_count === "number")
    assert.ok(Array.isArray(a.closures))
  })
})

// ---------------------------------------------------------------------------
// getAssurancePackState + exportAssurancePacks
// ---------------------------------------------------------------------------
describe("getAssurancePackState", () => {
  it("returns required fields", () => {
    const s = getAssurancePackState()
    assert.ok(typeof s.assurance_pack_count === "number")
    assert.ok(Array.isArray(s.assurance_packs))
    assert.ok(typeof s.by_status === "object")
  })
})

describe("exportAssurancePacks", () => {
  it("returns artifact with required fields", () => {
    const a = exportAssurancePacks()
    assert.ok(a.exported_at)
    assert.ok(a.governance_closure_version)
    assert.ok(typeof a.assurance_pack_count === "number")
    assert.ok(Array.isArray(a.assurance_packs))
  })
})

// ---------------------------------------------------------------------------
// generateAssuranceSummary
// ---------------------------------------------------------------------------
describe("generateAssuranceSummary", () => {
  it("returns required summary fields", () => {
    const s = generateAssuranceSummary()
    assert.ok(s.summary_generated_at)
    assert.ok(s.governance_closure_version)
    assert.ok(typeof s.overall_assurance_status === "string")
    assert.ok(typeof s.closure_count === "number")
    assert.ok(typeof s.assurance_pack_count === "number")
    assert.ok(Array.isArray(s.closures_summary))
    assert.ok(Array.isArray(s.packs_summary))
  })
  it("summary overall_assurance_status is a valid value", () => {
    // Shared module accumulates state from all tests; just verify the status is valid
    const c = makeClosure({ closureStatus: "closed", criticalEvidenceRefs: ["ev-sum-001"] })
    createAssurancePack({ closureId: c.data.closure_id, assuranceStatus: "issued" })
    const s = generateAssuranceSummary()
    assert.ok(["issued", "in_progress", "blocked", "no_packs"].includes(s.overall_assurance_status))
  })
})
