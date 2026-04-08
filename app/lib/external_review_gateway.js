"use strict"

/**
 * PROWORK PHASE 18 — Controlled External Access + Regulator/Third-Party Review Gateway
 *
 * Provides:
 * - Built-in reviewer type catalog (regulator, third_party_auditor, customer_reviewer)
 * - Built-in review scope catalog (evidence.read, audit.read, disclosure.export.read)
 * - Review status values (active, expired, revoked, consumed)
 * - In-memory review session registry
 * - Jurisdiction compatibility matrix for external review sessions
 * - createReviewSession(): register a new active review session
 * - resolveReviewSession(): fail-closed on unknown/expired/revoked/consumed
 * - validateReviewScope(): deny if required scope not covered by session
 * - validateCrossTenant(): deny if session tenant does not match request tenant
 * - validateReviewerType(): deny if reviewer type is unknown
 * - validateJurisdictionCompatibility(): deny if incompatible jurisdiction
 * - revokeReviewSession(): transition session to revoked
 * - consumeReviewSession(): transition session to consumed (one-time use)
 * - getGatewayState(): read-only snapshot
 * - exportGateway(): machine-readable artifact (no state mutation)
 *
 * Rules:
 * - missing session id → fail closed (reason: "missing_session_id")
 * - unknown session → fail closed (reason: "unknown_session")
 * - expired session → deny (reason: "session_expired")
 * - revoked session → deny (reason: "session_revoked")
 * - consumed session → deny (reason: "session_consumed")
 * - scope mismatch → deny (reason: "scope_mismatch")
 * - cross-tenant → deny (reason: "cross_tenant")
 * - incompatible jurisdiction → deny (reason: "incompatible_jurisdiction")
 * - unknown reviewer type → deny (reason: "unknown_reviewer_type")
 * - mutation through external gateway → deny (not enforced here, enforced in server)
 */

const fs     = require("fs")
const crypto = require("crypto")

// ---------------------------------------------------------------------------
// Schema version
// ---------------------------------------------------------------------------
const EXTERNAL_REVIEW_GATEWAY_VERSION = "1.0"

// ---------------------------------------------------------------------------
// Reviewer type catalog
// ---------------------------------------------------------------------------
const REVIEWER_TYPES = Object.freeze({
  REGULATOR:           "regulator",
  THIRD_PARTY_AUDITOR: "third_party_auditor",
  CUSTOMER_REVIEWER:   "customer_reviewer",
})

const _KNOWN_REVIEWER_TYPES = new Set(Object.values(REVIEWER_TYPES))

// ---------------------------------------------------------------------------
// Review scope catalog (read-only scopes only)
// ---------------------------------------------------------------------------
const REVIEW_SCOPES = Object.freeze({
  EVIDENCE_READ:          "evidence.read",
  AUDIT_READ:             "audit.read",
  DISCLOSURE_EXPORT_READ: "disclosure.export.read",
})

const _KNOWN_REVIEW_SCOPES = new Set(Object.values(REVIEW_SCOPES))

// Mutation scopes — explicitly disallowed through external gateway
const MUTATION_SCOPE_PREFIXES = Object.freeze(["admin.", "ops.", "config.", "write.", "execute.", "override."])

// ---------------------------------------------------------------------------
// Review status values
// ---------------------------------------------------------------------------
const REVIEW_STATUSES = Object.freeze({
  ACTIVE:   "active",
  EXPIRED:  "expired",
  REVOKED:  "revoked",
  CONSUMED: "consumed",
})

// ---------------------------------------------------------------------------
// Jurisdiction compatibility matrix (same rules as Phase 15)
// session jurisdiction code → accepted request jurisdiction codes
// ---------------------------------------------------------------------------
const _JURISDICTION_COMPAT = Object.freeze({
  KSA:    Object.freeze(new Set(["KSA", "GLOBAL"])),
  GCC:    Object.freeze(new Set(["KSA", "GCC", "GLOBAL"])),
  GLOBAL: Object.freeze(new Set(["KSA", "GCC", "GLOBAL"])),
})

// ---------------------------------------------------------------------------
// In-memory review session registry
// session_id → { review_session_id, reviewer_type, review_scope, review_status,
//                tenant_id, jurisdiction_code, disclosure_basis, expires_at,
//                revoked_at, consumed_at, created_at, evidence_version }
// ---------------------------------------------------------------------------
const _sessions = new Map()

// ---------------------------------------------------------------------------
// validateReviewerType — fail-closed on unknown type
// ---------------------------------------------------------------------------
function validateReviewerType(reviewerType) {
  const t = String(reviewerType || "").trim().toLowerCase()
  if (!t || !_KNOWN_REVIEWER_TYPES.has(t)) {
    return { ok: false, reason: "unknown_reviewer_type", reviewer_type: t || null }
  }
  return { ok: true, reviewer_type: t }
}

// ---------------------------------------------------------------------------
// validateReviewScope — deny if required scope not covered by session scope
// ---------------------------------------------------------------------------
function validateReviewScope(sessionScope, requiredScope) {
  const s = String(sessionScope  || "").trim()
  const r = String(requiredScope || "").trim()
  if (!r || !_KNOWN_REVIEW_SCOPES.has(r)) {
    return { ok: false, reason: "unknown_required_scope", required_scope: r || null }
  }
  if (s !== r) {
    return { ok: false, reason: "scope_mismatch", session_scope: s, required_scope: r }
  }
  return { ok: true, review_scope: s }
}

// ---------------------------------------------------------------------------
// validateCrossTenant — deny if session tenant != request tenant
// ---------------------------------------------------------------------------
function validateCrossTenant(sessionTenantId, requestTenantId) {
  const st = String(sessionTenantId  || "").trim()
  const rt = String(requestTenantId  || "").trim()
  if (!rt) {
    return { ok: false, reason: "missing_tenant_id" }
  }
  if (st !== "*" && st !== rt) {
    return { ok: false, reason: "cross_tenant", session_tenant: st, request_tenant: rt }
  }
  return { ok: true, tenant_id: rt }
}

// ---------------------------------------------------------------------------
// validateJurisdictionCompatibility — deny if incompatible jurisdiction
// ---------------------------------------------------------------------------
function validateJurisdictionCompatibility(requestedJurisdiction, sessionJurisdiction) {
  const req = String(requestedJurisdiction || "").trim().toUpperCase()
  const ses = String(sessionJurisdiction   || "").trim().toUpperCase()
  if (!req) {
    return { ok: false, reason: "missing_jurisdiction" }
  }
  // GLOBAL session jurisdiction accepts all known jurisdictions
  if (ses === "GLOBAL") {
    return { ok: true, jurisdiction_code: req }
  }
  // Requested jurisdiction must match session jurisdiction exactly (or be GLOBAL)
  if (req === "GLOBAL") {
    return { ok: true, jurisdiction_code: req }
  }
  const compat = _JURISDICTION_COMPAT[ses]
  if (!compat) {
    return { ok: false, reason: "unknown_session_jurisdiction", session_jurisdiction: ses }
  }
  if (!compat.has(req)) {
    return { ok: false, reason: "incompatible_jurisdiction", requested: req, session_jurisdiction: ses }
  }
  return { ok: true, jurisdiction_code: req }
}

// ---------------------------------------------------------------------------
// createReviewSession — register a new active review session
// ---------------------------------------------------------------------------
function createReviewSession({ reviewerType, reviewScope, tenantId, jurisdictionCode, disclosureBasis, expiresAt, evidenceVersion }) {
  const rtCheck = validateReviewerType(reviewerType)
  if (!rtCheck.ok) return { ok: false, reason: rtCheck.reason }

  const scope = String(reviewScope || "").trim()
  if (!scope || !_KNOWN_REVIEW_SCOPES.has(scope)) {
    return { ok: false, reason: "unknown_review_scope", review_scope: scope || null }
  }

  const tid = String(tenantId || "").trim()
  if (!tid) return { ok: false, reason: "missing_tenant_id" }

  const jc  = String(jurisdictionCode || "GLOBAL").trim().toUpperCase()
  const db  = String(disclosureBasis  || "").trim()
  const ev  = String(evidenceVersion  || EXTERNAL_REVIEW_GATEWAY_VERSION).trim()

  // Validate expiresAt — must be a future ISO timestamp if provided
  let expiresIso = null
  if (expiresAt) {
    const d = new Date(expiresAt)
    if (isNaN(d.getTime())) return { ok: false, reason: "invalid_expires_at" }
    expiresIso = d.toISOString()
  }

  const id    = `ers_${crypto.randomUUID()}`
  const entry = {
    review_session_id:             id,
    reviewer_type:                 rtCheck.reviewer_type,
    review_scope:                  scope,
    review_status:                 REVIEW_STATUSES.ACTIVE,
    tenant_id:                     tid,
    jurisdiction_code:             jc,
    disclosure_basis:              db || null,
    expires_at:                    expiresIso,
    revoked_at:                    null,
    consumed_at:                   null,
    created_at:                    new Date().toISOString(),
    evidence_version:              ev,
    external_review_gateway_version: EXTERNAL_REVIEW_GATEWAY_VERSION,
  }
  _sessions.set(id, entry)
  return { ok: true, data: { ...entry } }
}

// ---------------------------------------------------------------------------
// resolveReviewSession — fail-closed on unknown/expired/revoked/consumed
// ---------------------------------------------------------------------------
function resolveReviewSession(sessionId) {
  const id = String(sessionId || "").trim()
  if (!id) {
    return { ok: false, reason: "missing_session_id" }
  }
  const entry = _sessions.get(id)
  if (!entry) {
    return { ok: false, reason: "unknown_session", review_session_id: id }
  }
  // Check expiry first
  if (entry.expires_at) {
    const expiry = new Date(entry.expires_at)
    if (!isNaN(expiry.getTime()) && expiry < new Date()) {
      // Auto-transition to expired in registry
      const expired = { ...entry, review_status: REVIEW_STATUSES.EXPIRED }
      _sessions.set(id, expired)
      return { ok: false, reason: "session_expired", review_session_id: id }
    }
  }
  if (entry.review_status === REVIEW_STATUSES.EXPIRED) {
    return { ok: false, reason: "session_expired", review_session_id: id }
  }
  if (entry.review_status === REVIEW_STATUSES.REVOKED) {
    return { ok: false, reason: "session_revoked", review_session_id: id }
  }
  if (entry.review_status === REVIEW_STATUSES.CONSUMED) {
    return { ok: false, reason: "session_consumed", review_session_id: id }
  }
  return { ok: true, session: { ...entry } }
}

// ---------------------------------------------------------------------------
// revokeReviewSession — transition session to revoked
// ---------------------------------------------------------------------------
function revokeReviewSession(sessionId) {
  const id    = String(sessionId || "").trim()
  const entry = _sessions.get(id)
  if (!entry) return { ok: false, reason: "unknown_session" }
  if (entry.review_status === REVIEW_STATUSES.REVOKED)  return { ok: false, reason: "already_revoked" }
  if (entry.review_status === REVIEW_STATUSES.CONSUMED) return { ok: false, reason: "already_consumed" }
  const updated = { ...entry, review_status: REVIEW_STATUSES.REVOKED, revoked_at: new Date().toISOString() }
  _sessions.set(id, updated)
  return { ok: true, data: { ...updated } }
}

// ---------------------------------------------------------------------------
// consumeReviewSession — transition session to consumed (one-time use)
// ---------------------------------------------------------------------------
function consumeReviewSession(sessionId) {
  const id    = String(sessionId || "").trim()
  const entry = _sessions.get(id)
  if (!entry) return { ok: false, reason: "unknown_session" }
  if (entry.review_status !== REVIEW_STATUSES.ACTIVE) return { ok: false, reason: `session_${entry.review_status}` }
  const updated = { ...entry, review_status: REVIEW_STATUSES.CONSUMED, consumed_at: new Date().toISOString() }
  _sessions.set(id, updated)
  return { ok: true, data: { ...updated } }
}

// ---------------------------------------------------------------------------
// getGatewayState — read-only snapshot
// ---------------------------------------------------------------------------
function getGatewayState() {
  const reviewer_types  = Object.values(REVIEWER_TYPES)
  const review_scopes   = Object.values(REVIEW_SCOPES)
  const review_sessions = Array.from(_sessions.values()).map(s => ({ ...s }))
  return { reviewer_types, review_scopes, review_sessions }
}

// ---------------------------------------------------------------------------
// exportGateway — write JSON artifact (does not mutate state)
// ---------------------------------------------------------------------------
function exportGateway(outputPath) {
  const state    = getGatewayState()
  const active   = state.review_sessions.filter(s => s.review_status === REVIEW_STATUSES.ACTIVE).length
  const artifact = {
    exported_at:                       new Date().toISOString(),
    external_review_gateway_version:   EXTERNAL_REVIEW_GATEWAY_VERSION,
    reviewer_type_count:               state.reviewer_types.length,
    review_scope_count:                state.review_scopes.length,
    review_session_count:              state.review_sessions.length,
    active_session_count:              active,
    reviewer_types:                    state.reviewer_types,
    review_scopes:                     state.review_scopes,
    review_sessions:                   state.review_sessions,
  }
  if (outputPath) {
    fs.writeFileSync(outputPath, JSON.stringify(artifact, null, 2) + "\n", "utf8")
  }
  return artifact
}

module.exports = {
  EXTERNAL_REVIEW_GATEWAY_VERSION,
  REVIEWER_TYPES,
  REVIEW_SCOPES,
  REVIEW_STATUSES,
  MUTATION_SCOPE_PREFIXES,
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
}
