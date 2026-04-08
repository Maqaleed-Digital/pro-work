"use strict"

/**
 * Phase 18 — Controlled External Access + Regulator/Third-Party Review Gateway unit tests
 * Framework: node:test + node:assert (native, no dependencies)
 */

const { describe, it, afterEach } = require("node:test")
const assert = require("node:assert/strict")

const {
  EXTERNAL_REVIEW_GATEWAY_VERSION,
  REVIEWER_TYPES,
  REVIEW_SCOPES,
  REVIEW_STATUSES,
  validateReviewerType,
  validateReviewScope,
  validateCrossTenant,
  validateJurisdictionCompatibility,
  createReviewSession,
  resolveReviewSession,
  revokeReviewSession,
  consumeReviewSession,
  getGatewayState,
  exportGateway,
} = require("../../app/lib/external_review_gateway")

// ---------------------------------------------------------------------------
// Helpers — track and clean up sessions between tests
// ---------------------------------------------------------------------------
const _createdSessionIds = []
function trackSession(result) {
  if (result && result.ok && result.data && result.data.review_session_id) {
    _createdSessionIds.push(result.data.review_session_id)
  }
  return result
}
function revokeTracked() {
  while (_createdSessionIds.length) {
    const id = _createdSessionIds.pop()
    revokeReviewSession(id)
  }
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
describe("EXTERNAL_REVIEW_GATEWAY_VERSION", () => {
  it("exports a non-empty string", () => {
    assert.equal(typeof EXTERNAL_REVIEW_GATEWAY_VERSION, "string")
    assert.ok(EXTERNAL_REVIEW_GATEWAY_VERSION.length > 0)
  })
})

describe("REVIEWER_TYPES", () => {
  it("contains regulator, third_party_auditor, customer_reviewer", () => {
    assert.equal(REVIEWER_TYPES.REGULATOR,           "regulator")
    assert.equal(REVIEWER_TYPES.THIRD_PARTY_AUDITOR, "third_party_auditor")
    assert.equal(REVIEWER_TYPES.CUSTOMER_REVIEWER,   "customer_reviewer")
    assert.equal(Object.keys(REVIEWER_TYPES).length, 3)
  })
})

describe("REVIEW_SCOPES", () => {
  it("contains evidence.read, audit.read, disclosure.export.read", () => {
    assert.equal(REVIEW_SCOPES.EVIDENCE_READ,          "evidence.read")
    assert.equal(REVIEW_SCOPES.AUDIT_READ,             "audit.read")
    assert.equal(REVIEW_SCOPES.DISCLOSURE_EXPORT_READ, "disclosure.export.read")
    assert.equal(Object.keys(REVIEW_SCOPES).length, 3)
  })
})

describe("REVIEW_STATUSES", () => {
  it("contains active, expired, revoked, consumed", () => {
    assert.equal(REVIEW_STATUSES.ACTIVE,   "active")
    assert.equal(REVIEW_STATUSES.EXPIRED,  "expired")
    assert.equal(REVIEW_STATUSES.REVOKED,  "revoked")
    assert.equal(REVIEW_STATUSES.CONSUMED, "consumed")
  })
})

// ---------------------------------------------------------------------------
// validateReviewerType
// ---------------------------------------------------------------------------
describe("validateReviewerType", () => {
  it("accepts regulator", () => {
    const r = validateReviewerType("regulator")
    assert.equal(r.ok, true)
    assert.equal(r.reviewer_type, "regulator")
  })
  it("accepts third_party_auditor", () => {
    assert.equal(validateReviewerType("third_party_auditor").ok, true)
  })
  it("accepts customer_reviewer", () => {
    assert.equal(validateReviewerType("customer_reviewer").ok, true)
  })
  it("normalizes to lowercase", () => {
    const r = validateReviewerType("REGULATOR")
    assert.equal(r.ok, true)
    assert.equal(r.reviewer_type, "regulator")
  })
  it("rejects unknown type", () => {
    const r = validateReviewerType("hacker")
    assert.equal(r.ok, false)
    assert.equal(r.reason, "unknown_reviewer_type")
  })
  it("rejects empty string", () => {
    const r = validateReviewerType("")
    assert.equal(r.ok, false)
  })
  it("rejects null", () => {
    const r = validateReviewerType(null)
    assert.equal(r.ok, false)
  })
})

// ---------------------------------------------------------------------------
// validateReviewScope
// ---------------------------------------------------------------------------
describe("validateReviewScope", () => {
  it("matches evidence.read", () => {
    const r = validateReviewScope("evidence.read", "evidence.read")
    assert.equal(r.ok, true)
  })
  it("matches audit.read", () => {
    const r = validateReviewScope("audit.read", "audit.read")
    assert.equal(r.ok, true)
  })
  it("matches disclosure.export.read", () => {
    const r = validateReviewScope("disclosure.export.read", "disclosure.export.read")
    assert.equal(r.ok, true)
  })
  it("denies scope mismatch", () => {
    const r = validateReviewScope("audit.read", "evidence.read")
    assert.equal(r.ok, false)
    assert.equal(r.reason, "scope_mismatch")
  })
  it("denies unknown required scope", () => {
    const r = validateReviewScope("evidence.read", "admin.write")
    assert.equal(r.ok, false)
    assert.equal(r.reason, "unknown_required_scope")
  })
  it("denies empty required scope", () => {
    const r = validateReviewScope("evidence.read", "")
    assert.equal(r.ok, false)
  })
})

// ---------------------------------------------------------------------------
// validateCrossTenant
// ---------------------------------------------------------------------------
describe("validateCrossTenant", () => {
  it("allows same tenant", () => {
    const r = validateCrossTenant("tenant-a", "tenant-a")
    assert.equal(r.ok, true)
  })
  it("denies cross-tenant", () => {
    const r = validateCrossTenant("tenant-a", "tenant-b")
    assert.equal(r.ok, false)
    assert.equal(r.reason, "cross_tenant")
  })
  it("wildcard session tenant allows any", () => {
    const r = validateCrossTenant("*", "any-tenant")
    assert.equal(r.ok, true)
  })
  it("denies missing request tenant", () => {
    const r = validateCrossTenant("tenant-a", "")
    assert.equal(r.ok, false)
    assert.equal(r.reason, "missing_tenant_id")
  })
})

// ---------------------------------------------------------------------------
// validateJurisdictionCompatibility
// ---------------------------------------------------------------------------
describe("validateJurisdictionCompatibility", () => {
  it("KSA session allows KSA request", () => {
    assert.equal(validateJurisdictionCompatibility("KSA", "KSA").ok, true)
  })
  it("KSA session allows GLOBAL request", () => {
    assert.equal(validateJurisdictionCompatibility("GLOBAL", "KSA").ok, true)
  })
  it("KSA session denies GCC request", () => {
    const r = validateJurisdictionCompatibility("GCC", "KSA")
    assert.equal(r.ok, false)
    assert.equal(r.reason, "incompatible_jurisdiction")
  })
  it("GCC session allows KSA, GCC, GLOBAL requests", () => {
    assert.equal(validateJurisdictionCompatibility("KSA",    "GCC").ok, true)
    assert.equal(validateJurisdictionCompatibility("GCC",    "GCC").ok, true)
    assert.equal(validateJurisdictionCompatibility("GLOBAL", "GCC").ok, true)
  })
  it("GLOBAL session allows all", () => {
    assert.equal(validateJurisdictionCompatibility("KSA",    "GLOBAL").ok, true)
    assert.equal(validateJurisdictionCompatibility("GCC",    "GLOBAL").ok, true)
    assert.equal(validateJurisdictionCompatibility("GLOBAL", "GLOBAL").ok, true)
  })
  it("denies missing request jurisdiction", () => {
    const r = validateJurisdictionCompatibility("", "KSA")
    assert.equal(r.ok, false)
    assert.equal(r.reason, "missing_jurisdiction")
  })
})

// ---------------------------------------------------------------------------
// createReviewSession
// ---------------------------------------------------------------------------
describe("createReviewSession", () => {
  afterEach(() => revokeTracked())

  it("creates active session with required fields", () => {
    const r = trackSession(createReviewSession({
      reviewerType: "regulator", reviewScope: "evidence.read",
      tenantId: "t1", jurisdictionCode: "KSA",
    }))
    assert.equal(r.ok, true)
    assert.ok(r.data.review_session_id.startsWith("ers_"))
    assert.equal(r.data.review_status, REVIEW_STATUSES.ACTIVE)
    assert.equal(r.data.reviewer_type, "regulator")
    assert.equal(r.data.review_scope, "evidence.read")
    assert.equal(r.data.tenant_id, "t1")
    assert.equal(r.data.jurisdiction_code, "KSA")
    assert.ok(r.data.created_at)
    assert.equal(r.data.revoked_at, null)
    assert.equal(r.data.consumed_at, null)
  })
  it("rejects unknown reviewer type", () => {
    const r = createReviewSession({ reviewerType: "intruder", reviewScope: "evidence.read", tenantId: "t1" })
    assert.equal(r.ok, false)
    assert.equal(r.reason, "unknown_reviewer_type")
  })
  it("rejects unknown review scope", () => {
    const r = createReviewSession({ reviewerType: "regulator", reviewScope: "admin.write", tenantId: "t1" })
    assert.equal(r.ok, false)
    assert.equal(r.reason, "unknown_review_scope")
  })
  it("rejects missing tenantId", () => {
    const r = createReviewSession({ reviewerType: "regulator", reviewScope: "evidence.read", tenantId: "" })
    assert.equal(r.ok, false)
    assert.equal(r.reason, "missing_tenant_id")
  })
  it("rejects invalid expiresAt", () => {
    const r = createReviewSession({ reviewerType: "regulator", reviewScope: "evidence.read", tenantId: "t1", expiresAt: "not-a-date" })
    assert.equal(r.ok, false)
    assert.equal(r.reason, "invalid_expires_at")
  })
  it("stores disclosure_basis when provided", () => {
    const r = trackSession(createReviewSession({
      reviewerType: "regulator", reviewScope: "disclosure.export.read",
      tenantId: "t2", disclosureBasis: "regulatory.request",
    }))
    assert.equal(r.ok, true)
    assert.equal(r.data.disclosure_basis, "regulatory.request")
  })
  it("generates unique session IDs", () => {
    const r1 = trackSession(createReviewSession({ reviewerType: "regulator", reviewScope: "evidence.read", tenantId: "t3" }))
    const r2 = trackSession(createReviewSession({ reviewerType: "regulator", reviewScope: "evidence.read", tenantId: "t3" }))
    assert.notEqual(r1.data.review_session_id, r2.data.review_session_id)
  })
})

// ---------------------------------------------------------------------------
// resolveReviewSession
// ---------------------------------------------------------------------------
describe("resolveReviewSession", () => {
  afterEach(() => revokeTracked())

  it("resolves active session", () => {
    const s = trackSession(createReviewSession({ reviewerType: "regulator", reviewScope: "evidence.read", tenantId: "t1" }))
    const r = resolveReviewSession(s.data.review_session_id)
    assert.equal(r.ok, true)
    assert.ok(r.session)
  })
  it("fails for unknown session id", () => {
    const r = resolveReviewSession("ers_nonexistent")
    assert.equal(r.ok, false)
    assert.equal(r.reason, "unknown_session")
  })
  it("fails for missing session id", () => {
    const r = resolveReviewSession("")
    assert.equal(r.ok, false)
    assert.equal(r.reason, "missing_session_id")
  })
  it("fails for null session id", () => {
    const r = resolveReviewSession(null)
    assert.equal(r.ok, false)
    assert.equal(r.reason, "missing_session_id")
  })
  it("fails for expired session (past expiresAt)", () => {
    const past = new Date(Date.now() - 1000).toISOString()
    const s = trackSession(createReviewSession({ reviewerType: "regulator", reviewScope: "evidence.read", tenantId: "t1", expiresAt: past }))
    const r = resolveReviewSession(s.data.review_session_id)
    assert.equal(r.ok, false)
    assert.equal(r.reason, "session_expired")
  })
  it("fails for revoked session", () => {
    const s = trackSession(createReviewSession({ reviewerType: "regulator", reviewScope: "evidence.read", tenantId: "t1" }))
    revokeReviewSession(s.data.review_session_id)
    const r = resolveReviewSession(s.data.review_session_id)
    assert.equal(r.ok, false)
    assert.equal(r.reason, "session_revoked")
  })
  it("fails for consumed session", () => {
    const s = trackSession(createReviewSession({ reviewerType: "regulator", reviewScope: "evidence.read", tenantId: "t1" }))
    consumeReviewSession(s.data.review_session_id)
    const r = resolveReviewSession(s.data.review_session_id)
    assert.equal(r.ok, false)
    assert.equal(r.reason, "session_consumed")
  })
})

// ---------------------------------------------------------------------------
// revokeReviewSession
// ---------------------------------------------------------------------------
describe("revokeReviewSession", () => {
  afterEach(() => revokeTracked())

  it("transitions active session to revoked", () => {
    const s = trackSession(createReviewSession({ reviewerType: "regulator", reviewScope: "audit.read", tenantId: "t1" }))
    const r = revokeReviewSession(s.data.review_session_id)
    assert.equal(r.ok, true)
    assert.equal(r.data.review_status, REVIEW_STATUSES.REVOKED)
    assert.ok(r.data.revoked_at)
  })
  it("fails for unknown session", () => {
    const r = revokeReviewSession("ers_nonexistent")
    assert.equal(r.ok, false)
    assert.equal(r.reason, "unknown_session")
  })
  it("fails if already revoked", () => {
    const s = trackSession(createReviewSession({ reviewerType: "regulator", reviewScope: "audit.read", tenantId: "t1" }))
    revokeReviewSession(s.data.review_session_id)
    const r = revokeReviewSession(s.data.review_session_id)
    assert.equal(r.ok, false)
    assert.equal(r.reason, "already_revoked")
  })
})

// ---------------------------------------------------------------------------
// consumeReviewSession
// ---------------------------------------------------------------------------
describe("consumeReviewSession", () => {
  afterEach(() => revokeTracked())

  it("transitions active session to consumed", () => {
    const s = trackSession(createReviewSession({ reviewerType: "customer_reviewer", reviewScope: "evidence.read", tenantId: "t1" }))
    const r = consumeReviewSession(s.data.review_session_id)
    assert.equal(r.ok, true)
    assert.equal(r.data.review_status, REVIEW_STATUSES.CONSUMED)
    assert.ok(r.data.consumed_at)
  })
  it("fails for non-active session", () => {
    const s = trackSession(createReviewSession({ reviewerType: "customer_reviewer", reviewScope: "evidence.read", tenantId: "t1" }))
    revokeReviewSession(s.data.review_session_id)
    const r = consumeReviewSession(s.data.review_session_id)
    assert.equal(r.ok, false)
  })
})

// ---------------------------------------------------------------------------
// getGatewayState
// ---------------------------------------------------------------------------
describe("getGatewayState", () => {
  it("returns reviewer_types, review_scopes, review_sessions", () => {
    const s = getGatewayState()
    assert.ok(Array.isArray(s.reviewer_types))
    assert.ok(Array.isArray(s.review_scopes))
    assert.ok(Array.isArray(s.review_sessions))
  })
  it("contains all 3 reviewer types", () => {
    const s = getGatewayState()
    assert.ok(s.reviewer_types.includes("regulator"))
    assert.ok(s.reviewer_types.includes("third_party_auditor"))
    assert.ok(s.reviewer_types.includes("customer_reviewer"))
  })
  it("contains all 3 review scopes", () => {
    const s = getGatewayState()
    assert.ok(s.review_scopes.includes("evidence.read"))
    assert.ok(s.review_scopes.includes("audit.read"))
    assert.ok(s.review_scopes.includes("disclosure.export.read"))
  })
  it("returns snapshots (not references)", () => {
    const s1 = getGatewayState()
    const s2 = getGatewayState()
    assert.notEqual(s1, s2)
    assert.notEqual(s1.review_sessions, s2.review_sessions)
  })
})

// ---------------------------------------------------------------------------
// exportGateway
// ---------------------------------------------------------------------------
describe("exportGateway", () => {
  it("returns artifact with required fields", () => {
    const a = exportGateway()
    assert.ok(a.exported_at)
    assert.ok(a.external_review_gateway_version)
    assert.ok(typeof a.reviewer_type_count === "number")
    assert.ok(typeof a.review_scope_count === "number")
    assert.ok(typeof a.review_session_count === "number")
    assert.ok(typeof a.active_session_count === "number")
    assert.ok(Array.isArray(a.reviewer_types))
    assert.ok(Array.isArray(a.review_scopes))
    assert.ok(Array.isArray(a.review_sessions))
  })
  it("reviewer_type_count matches catalog", () => {
    const a = exportGateway()
    assert.equal(a.reviewer_type_count, Object.keys(REVIEWER_TYPES).length)
  })
  it("review_scope_count matches catalog", () => {
    const a = exportGateway()
    assert.equal(a.review_scope_count, Object.keys(REVIEW_SCOPES).length)
  })
  it("does not mutate state", () => {
    const a1 = exportGateway()
    const a2 = exportGateway()
    assert.equal(a1.reviewer_type_count, a2.reviewer_type_count)
    assert.equal(a1.review_scope_count,  a2.review_scope_count)
  })
})
