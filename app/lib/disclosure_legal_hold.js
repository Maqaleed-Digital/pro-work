"use strict"

/**
 * PROWORK PHASE 17 — Regulatory Disclosure + Legal Hold Governance
 *
 * Provides:
 * - Built-in disclosure basis catalog (regulatory.request, customer.disclosure, internal.audit.review)
 * - Built-in disclosure scope catalog (audit_records, approval_records, full_export)
 * - Scope compatibility matrix per basis (fail-closed on out-of-scope)
 * - In-memory legal hold registry (tenant_id → active/released holds)
 * - resolveDisclosureBasis(): fail-closed on unknown/inactive
 * - validateDisclosureScope(): deny if scope exceeds basis allowance
 * - validateLegalHoldState(): fail-closed on unknown state declaration
 * - createLegalHold(): register a new active hold for a tenant
 * - hasActiveLegalHold(): check if any active hold exists for a tenant
 * - releaseLegalHold(): transition hold to released
 * - getGovernanceState(): read-only snapshot
 * - exportGovernance(): machine-readable artifact (no state mutation)
 *
 * Rules:
 * - unknown disclosure basis → fail closed (reason: "unknown_basis")
 * - inactive disclosure basis → fail closed (reason: "inactive_basis")
 * - unknown scope → fail closed (reason: "unknown_scope")
 * - scope exceeds basis allowance → fail closed (reason: "out_of_scope")
 * - unknown legal hold state → fail closed (reason: "unknown_hold_state")
 * - active legal hold → blocks disposal/lifecycle actions (reason: "active_legal_hold")
 * - released or no hold → proceeds
 */

const fs     = require("fs")
const crypto = require("crypto")

// ---------------------------------------------------------------------------
// Schema version
// ---------------------------------------------------------------------------
const DISCLOSURE_GOVERNANCE_VERSION = "1.0"

// ---------------------------------------------------------------------------
// Disclosure basis catalog
// ---------------------------------------------------------------------------
const DISCLOSURE_BASES = Object.freeze({
  "regulatory.request": Object.freeze({
    basis:          "regulatory.request",
    name:           "Regulatory Request",
    status:         "active",
    policy_version: "1.0",
    description:    "Disclosure required by regulatory or government request",
  }),
  "customer.disclosure": Object.freeze({
    basis:          "customer.disclosure",
    name:           "Customer Disclosure",
    status:         "active",
    policy_version: "1.0",
    description:    "Disclosure to a customer of their own data",
  }),
  "internal.audit.review": Object.freeze({
    basis:          "internal.audit.review",
    name:           "Internal Audit Review",
    status:         "active",
    policy_version: "1.0",
    description:    "Internal compliance or audit team review",
  }),
})

// ---------------------------------------------------------------------------
// Disclosure scope catalog
// ---------------------------------------------------------------------------
const DISCLOSURE_SCOPES = Object.freeze({
  "audit_records":    { scope: "audit_records",    description: "Authorization audit records only" },
  "approval_records": { scope: "approval_records", description: "Approval request and decision records" },
  "full_export":      { scope: "full_export",      description: "Complete governed evidence export" },
})

// ---------------------------------------------------------------------------
// Scope allowance matrix: which scopes each basis is permitted to use
// ---------------------------------------------------------------------------
const _SCOPE_MATRIX = Object.freeze({
  "regulatory.request":    Object.freeze(new Set(["audit_records", "approval_records", "full_export"])),
  "customer.disclosure":   Object.freeze(new Set(["audit_records", "approval_records"])),
  "internal.audit.review": Object.freeze(new Set(["audit_records"])),
})

// ---------------------------------------------------------------------------
// Legal hold states
// ---------------------------------------------------------------------------
const LEGAL_HOLD_STATES = Object.freeze({
  NONE:     "none",
  ACTIVE:   "active",
  RELEASED: "released",
})

const _KNOWN_HOLD_STATES = new Set(Object.values(LEGAL_HOLD_STATES))

// ---------------------------------------------------------------------------
// In-memory legal hold registry
// hold_id → { legal_hold_id, tenant_id, scope, note, status, created_at, released_at }
// ---------------------------------------------------------------------------
const _legalHolds = new Map()

// ---------------------------------------------------------------------------
// resolveDisclosureBasis — fail-closed on unknown or inactive
// ---------------------------------------------------------------------------
function resolveDisclosureBasis(basis) {
  const k = String(basis || "").trim()
  if (!k || !DISCLOSURE_BASES[k]) {
    return { ok: false, reason: "unknown_basis", disclosure_basis: k || null }
  }
  const entry = DISCLOSURE_BASES[k]
  if (entry.status !== "active") {
    return { ok: false, reason: "inactive_basis", disclosure_basis: k }
  }
  return { ok: true, entry, disclosure_basis: k }
}

// ---------------------------------------------------------------------------
// validateDisclosureScope — deny if scope exceeds basis allowance
// ---------------------------------------------------------------------------
function validateDisclosureScope(basis, scope) {
  const k    = String(basis || "").trim()
  const s    = String(scope || "").trim()
  if (!s || !DISCLOSURE_SCOPES[s]) {
    return { ok: false, reason: "unknown_scope", scope: s || null }
  }
  const allowed = _SCOPE_MATRIX[k]
  if (!allowed) {
    return { ok: false, reason: "unknown_basis", basis: k }
  }
  if (!allowed.has(s)) {
    return { ok: false, reason: "out_of_scope", scope: s, basis: k, allowed_scopes: Array.from(allowed) }
  }
  return { ok: true, reason: "in_scope", scope: s, basis: k }
}

// ---------------------------------------------------------------------------
// validateLegalHoldState — fail-closed on unknown state declaration
// ---------------------------------------------------------------------------
function validateLegalHoldState(declaredState) {
  const s = String(declaredState || "").trim().toLowerCase()
  if (!s || !_KNOWN_HOLD_STATES.has(s)) {
    return { ok: false, reason: "unknown_hold_state", declared: declaredState || null }
  }
  return { ok: true, state: s }
}

// ---------------------------------------------------------------------------
// createLegalHold — register a new active hold for a tenant
// ---------------------------------------------------------------------------
function createLegalHold({ tenantId, scope, note }) {
  const tid   = String(tenantId || "").trim()
  const sc    = String(scope    || "full_export").trim()
  const n     = String(note     || "").trim()
  if (!tid) return { ok: false, reason: "missing_tenant_id" }
  if (!DISCLOSURE_SCOPES[sc]) return { ok: false, reason: "unknown_scope" }
  const id    = `lh_${crypto.randomUUID()}`
  const entry = {
    legal_hold_id:               id,
    tenant_id:                   tid,
    scope:                       sc,
    note:                        n,
    status:                      LEGAL_HOLD_STATES.ACTIVE,
    legal_hold_policy_version:   DISCLOSURE_GOVERNANCE_VERSION,
    created_at:                  new Date().toISOString(),
    released_at:                 null,
  }
  _legalHolds.set(id, entry)
  return { ok: true, data: { ...entry } }
}

// ---------------------------------------------------------------------------
// hasActiveLegalHold — returns true if tenant has at least one active hold
// ---------------------------------------------------------------------------
function hasActiveLegalHold(tenantId) {
  const tid = String(tenantId || "").trim()
  for (const entry of _legalHolds.values()) {
    if (entry.tenant_id === tid && entry.status === LEGAL_HOLD_STATES.ACTIVE) return true
  }
  return false
}

// ---------------------------------------------------------------------------
// getLegalHoldsForTenant — returns all holds for a tenant
// ---------------------------------------------------------------------------
function getLegalHoldsForTenant(tenantId) {
  const tid = String(tenantId || "").trim()
  return Array.from(_legalHolds.values())
    .filter(e => e.tenant_id === tid)
    .map(e => ({ ...e }))
}

// ---------------------------------------------------------------------------
// releaseLegalHold — transition hold to released
// ---------------------------------------------------------------------------
function releaseLegalHold(legalHoldId) {
  const id    = String(legalHoldId || "").trim()
  const entry = _legalHolds.get(id)
  if (!entry) return { ok: false, reason: "unknown_hold_id" }
  if (entry.status === LEGAL_HOLD_STATES.RELEASED) return { ok: false, reason: "already_released" }
  const updated = { ...entry, status: LEGAL_HOLD_STATES.RELEASED, released_at: new Date().toISOString() }
  _legalHolds.set(id, updated)
  return { ok: true, data: { ...updated } }
}

// ---------------------------------------------------------------------------
// getGovernanceState — read-only snapshot
// ---------------------------------------------------------------------------
function getGovernanceState() {
  const bases  = Object.values(DISCLOSURE_BASES).map(b => ({ ...b }))
  const scopes = Object.values(DISCLOSURE_SCOPES).map(s => ({ ...s }))
  const holds  = Array.from(_legalHolds.values()).map(h => ({ ...h }))
  return { bases, scopes, legal_holds: holds }
}

// ---------------------------------------------------------------------------
// exportGovernance — write JSON artifact (does not mutate state)
// ---------------------------------------------------------------------------
function exportGovernance(outputPath) {
  const state    = getGovernanceState()
  const artifact = {
    exported_at:                    new Date().toISOString(),
    disclosure_governance_version:  DISCLOSURE_GOVERNANCE_VERSION,
    disclosure_basis_count:         state.bases.length,
    disclosure_scope_count:         state.scopes.length,
    legal_hold_count:               state.legal_holds.length,
    active_hold_count:              state.legal_holds.filter(h => h.status === LEGAL_HOLD_STATES.ACTIVE).length,
    disclosure_bases:               state.bases,
    disclosure_scopes:              state.scopes,
    legal_holds:                    state.legal_holds,
  }
  if (outputPath) {
    fs.writeFileSync(outputPath, JSON.stringify(artifact, null, 2) + "\n", "utf8")
  }
  return artifact
}

module.exports = {
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
}
