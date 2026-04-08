"use strict"

/**
 * PROWORK PHASE 15 — Tenant-Bound Governance + Jurisdictional Isolation
 *
 * Provides:
 * - Built-in jurisdiction catalog (KSA, GCC, GLOBAL)
 * - In-memory tenant governance overlay (tenant_id → jurisdiction assignment)
 * - resolveJurisdiction(): fail-closed on unknown/inactive
 * - resolveTenantGovernance(): fail-closed on unknown/inactive tenant
 * - validateCrossTenant(): deny cross-tenant privileged action (wildcard "*" passes)
 * - validateJurisdictionCompatibility(): deny incompatible jurisdiction request
 * - initTenantGovernance(): populate from tenantRegistry at startup
 * - setTenantJurisdiction(): in-memory admin/test mutation
 * - getGovernanceState(): read-only snapshot
 * - exportGovernance(): machine-readable artifact (no state mutation)
 *
 * Rules:
 * - unknown tenant → fail closed (reason: "unknown_tenant")
 * - inactive tenant → fail closed (reason: "inactive_tenant")
 * - unknown jurisdiction → fail closed (reason: "unknown_jurisdiction")
 * - inactive jurisdiction → fail closed (reason: "inactive_jurisdiction")
 * - cross-tenant mismatch without wildcard → fail closed (reason: "cross_tenant")
 * - incompatible jurisdiction → fail closed (reason: "incompatible_jurisdiction")
 * - GLOBAL jurisdiction in request → compatible with all tenant jurisdictions
 * - tenant with GLOBAL jurisdiction accepts any known request jurisdiction
 */

const fs   = require("fs")
const path = require("path")

// ---------------------------------------------------------------------------
// Schema version
// ---------------------------------------------------------------------------
const TENANT_GOVERNANCE_VERSION = "1.0"

// ---------------------------------------------------------------------------
// Jurisdiction catalog — built-in and authoritative
// ---------------------------------------------------------------------------
const JURISDICTIONS = Object.freeze({
  KSA: Object.freeze({
    code:              "KSA",
    name:              "Kingdom of Saudi Arabia",
    status:            "active",
    policy_version:    "1.0",
    description:       "Saudi Arabia jurisdictional scope",
  }),
  GCC: Object.freeze({
    code:              "GCC",
    name:              "Gulf Cooperation Council",
    status:            "active",
    policy_version:    "1.0",
    description:       "GCC regional jurisdictional scope",
  }),
  GLOBAL: Object.freeze({
    code:              "GLOBAL",
    name:              "Global",
    status:            "active",
    policy_version:    "1.0",
    description:       "Global scope — compatible with all tenant jurisdictions",
  }),
})

const JURISDICTION_STATUSES = Object.freeze({
  ACTIVE:   "active",
  INACTIVE: "inactive",
})

// ---------------------------------------------------------------------------
// Compatibility matrix
// For a request jurisdiction to be compatible with a tenant jurisdiction:
//   - GLOBAL request → always compatible
//   - tenant GLOBAL → accepts any known jurisdiction
//   - KSA request → compatible only with KSA tenant
//   - GCC request → compatible with GCC or KSA tenant (KSA is a GCC member)
// ---------------------------------------------------------------------------
const _COMPAT = Object.freeze({
  KSA:    Object.freeze(new Set(["KSA", "GLOBAL"])),            // KSA tenant: accepts KSA and GLOBAL requests
  GCC:    Object.freeze(new Set(["GCC", "KSA", "GLOBAL"])),     // GCC tenant: accepts GCC, KSA, GLOBAL
  GLOBAL: Object.freeze(new Set(["KSA", "GCC", "GLOBAL"])),     // GLOBAL tenant: accepts anything
})

// ---------------------------------------------------------------------------
// In-memory tenant governance state
// tenant_id → { tenant_id, jurisdiction_code, tenant_governance_version, status, initialized_at }
// ---------------------------------------------------------------------------
const _tenantGovernance = new Map()

// ---------------------------------------------------------------------------
// resolveJurisdiction — fail-closed on unknown or inactive
// ---------------------------------------------------------------------------
function resolveJurisdiction(code) {
  const k = String(code || "").trim().toUpperCase()
  if (!k || !JURISDICTIONS[k]) {
    return { ok: false, reason: "unknown_jurisdiction", jurisdiction_code: k || null }
  }
  const entry = JURISDICTIONS[k]
  if (entry.status !== JURISDICTION_STATUSES.ACTIVE) {
    return { ok: false, reason: "inactive_jurisdiction", jurisdiction_code: k }
  }
  return { ok: true, entry, jurisdiction_code: k }
}

// ---------------------------------------------------------------------------
// resolveTenantGovernance — fail-closed on unknown or inactive tenant
// Requires the tenantRegistry (plain object from server scope) to be passed.
// ---------------------------------------------------------------------------
function resolveTenantGovernance(tenantId, tenantRegistry) {
  const tid = String(tenantId || "").trim()
  if (!tid) {
    return { ok: false, reason: "missing_tenant", tenant_id: null }
  }
  if (!tenantRegistry || typeof tenantRegistry !== "object" || Array.isArray(tenantRegistry)) {
    return { ok: false, reason: "unknown_tenant", tenant_id: tid }
  }
  const regEntry = tenantRegistry[tid]
  if (!regEntry) {
    return { ok: false, reason: "unknown_tenant", tenant_id: tid }
  }
  if (String(regEntry.status || "active") !== "active") {
    return { ok: false, reason: "inactive_tenant", tenant_id: tid }
  }
  const gov = _tenantGovernance.get(tid)
  const jurisdictionCode = gov ? gov.jurisdiction_code : "GLOBAL"
  return {
    ok:                      true,
    tenant_id:               tid,
    jurisdiction_code:       jurisdictionCode,
    tenant_governance_version: TENANT_GOVERNANCE_VERSION,
    status:                  regEntry.status || "active",
    tenant_name:             regEntry.name || tid,
  }
}

// ---------------------------------------------------------------------------
// validateCrossTenant — deny cross-tenant access; wildcard "*" always passes
// principalTenantId is the tenant_id of the authenticated principal.
// requestTenantId is the tenant_id from the request context.
// ---------------------------------------------------------------------------
function validateCrossTenant(principalTenantId, requestTenantId) {
  const pTid = String(principalTenantId || "").trim()
  const rTid = String(requestTenantId  || "").trim()
  if (pTid === "*") return { ok: true, reason: "wildcard" }
  if (!pTid || !rTid) return { ok: false, reason: "cross_tenant", principal_tenant: pTid, request_tenant: rTid }
  if (pTid === rTid)  return { ok: true, reason: "same_tenant" }
  return { ok: false, reason: "cross_tenant", principal_tenant: pTid, request_tenant: rTid }
}

// ---------------------------------------------------------------------------
// validateJurisdictionCompatibility
// requestedCode:  the jurisdiction code from the request (X-Jurisdiction-Code)
// tenantJurisdiction: the tenant's governed jurisdiction_code
// GLOBAL request → always compatible
// GLOBAL tenant  → accepts any known jurisdiction
// ---------------------------------------------------------------------------
function validateJurisdictionCompatibility(requestedCode, tenantJurisdiction) {
  const rCode = String(requestedCode   || "").trim().toUpperCase()
  const tCode = String(tenantJurisdiction || "GLOBAL").trim().toUpperCase()

  if (!rCode) {
    return { ok: false, reason: "missing_jurisdiction" }
  }
  // Unknown request jurisdiction
  if (!JURISDICTIONS[rCode]) {
    return { ok: false, reason: "unknown_jurisdiction", requested: rCode }
  }
  // GLOBAL request is always compatible
  if (rCode === "GLOBAL") {
    return { ok: true, reason: "global_request" }
  }
  // GLOBAL tenant accepts any known jurisdiction
  if (tCode === "GLOBAL" || !JURISDICTIONS[tCode]) {
    return { ok: true, reason: "global_tenant" }
  }
  // Check compat matrix: what can the tenant accept?
  const acceptedRequests = _COMPAT[tCode]
  if (!acceptedRequests || !acceptedRequests.has(rCode)) {
    return { ok: false, reason: "incompatible_jurisdiction", requested: rCode, tenant_jurisdiction: tCode }
  }
  return { ok: true, reason: "compatible", requested: rCode, tenant_jurisdiction: tCode }
}

// ---------------------------------------------------------------------------
// initTenantGovernance — populate governance map from tenantRegistry at startup
// Sets all tenants to GLOBAL jurisdiction by default.
// ---------------------------------------------------------------------------
function initTenantGovernance(tenantRegistry) {
  if (!tenantRegistry || typeof tenantRegistry !== "object") return
  for (const [tid, entry] of Object.entries(tenantRegistry)) {
    if (!_tenantGovernance.has(tid)) {
      _tenantGovernance.set(tid, {
        tenant_id:                 tid,
        jurisdiction_code:         "GLOBAL",
        tenant_governance_version: TENANT_GOVERNANCE_VERSION,
        status:                    entry.status || "active",
        initialized_at:            new Date().toISOString(),
      })
    }
  }
}

// ---------------------------------------------------------------------------
// setTenantJurisdiction — in-memory mutation (admin + test use)
// ---------------------------------------------------------------------------
function setTenantJurisdiction(tenantId, jurisdictionCode, tenantRegistry) {
  const tid  = String(tenantId       || "").trim()
  const code = String(jurisdictionCode || "").trim().toUpperCase()

  if (!tid) return { ok: false, reason: "missing_tenant" }
  if (!JURISDICTIONS[code]) return { ok: false, reason: "unknown_jurisdiction" }
  if (tenantRegistry && !tenantRegistry[tid]) return { ok: false, reason: "unknown_tenant" }

  const existing = _tenantGovernance.get(tid) || {
    tenant_id:                 tid,
    tenant_governance_version: TENANT_GOVERNANCE_VERSION,
    status:                    "active",
    initialized_at:            new Date().toISOString(),
  }
  _tenantGovernance.set(tid, { ...existing, jurisdiction_code: code })
  return { ok: true, tenant_id: tid, jurisdiction_code: code }
}

// ---------------------------------------------------------------------------
// getGovernanceState — read-only snapshot of all tenant governance entries
// ---------------------------------------------------------------------------
function getGovernanceState() {
  return Array.from(_tenantGovernance.values()).map(e => ({ ...e }))
}

// ---------------------------------------------------------------------------
// exportGovernance — write JSON artifact (does not mutate state)
// ---------------------------------------------------------------------------
function exportGovernance(outputPath, tenantRegistry) {
  const entries     = getGovernanceState()
  const jurisdicts  = Object.values(JURISDICTIONS).map(j => ({ ...j }))
  const artifact = {
    exported_at:               new Date().toISOString(),
    tenant_governance_version: TENANT_GOVERNANCE_VERSION,
    tenant_count:              entries.length,
    jurisdiction_count:        jurisdicts.length,
    tenants:                   entries,
    jurisdictions:             jurisdicts,
  }
  if (outputPath) {
    fs.writeFileSync(outputPath, JSON.stringify(artifact, null, 2) + "\n", "utf8")
  }
  return artifact
}

module.exports = {
  TENANT_GOVERNANCE_VERSION,
  JURISDICTIONS,
  JURISDICTION_STATUSES,
  resolveJurisdiction,
  resolveTenantGovernance,
  validateCrossTenant,
  validateJurisdictionCompatibility,
  initTenantGovernance,
  setTenantJurisdiction,
  getGovernanceState,
  exportGovernance,
}
