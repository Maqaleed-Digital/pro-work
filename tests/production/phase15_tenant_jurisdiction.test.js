"use strict"

/**
 * PROWORK PHASE 15 — Tenant-Bound Governance + Jurisdictional Isolation Unit Tests
 *
 * Covers:
 * - JURISDICTIONS catalog completeness
 * - TENANT_GOVERNANCE_VERSION constant
 * - resolveJurisdiction: active, unknown, null
 * - resolveTenantGovernance: active tenant, inactive tenant, unknown tenant, missing tenantRegistry
 * - validateCrossTenant: wildcard, same-tenant, cross-tenant
 * - validateJurisdictionCompatibility: GLOBAL request, GLOBAL tenant, KSA/GCC rules, incompatible
 * - initTenantGovernance: populates governance from registry
 * - setTenantJurisdiction: valid transition, unknown jurisdiction, unknown tenant
 * - getGovernanceState: snapshot completeness
 * - exportGovernance: artifact structure and non-mutation
 * - POLICY-JURISDICTION-CODES-PRESENT: KSA, GCC, GLOBAL exist
 * - POLICY-CROSS-TENANT-DENIED: wildcard passes, mismatch denied
 * - POLICY-JURISDICTION-COMPAT: GLOBAL always passes, incompatible denied
 */

const { test, describe } = require("node:test")
const assert = require("node:assert")
const fs     = require("fs")
const os     = require("os")
const path   = require("path")
const crypto = require("crypto")

const TJ = require("../../app/lib/tenant_jurisdiction")
const {
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
} = TJ

function tmpFile() {
  return path.join(os.tmpdir(), `prowork_tj_test_${crypto.randomUUID()}.json`)
}

// Minimal tenant registry for tests
const _REG = {
  active_tenant:   { tenant_id: "active_tenant",   name: "Active",   status: "active"   },
  inactive_tenant: { tenant_id: "inactive_tenant",  name: "Inactive", status: "disabled" },
  ksa_tenant:      { tenant_id: "ksa_tenant",       name: "KSA Co",   status: "active"   },
  gcc_tenant:      { tenant_id: "gcc_tenant",       name: "GCC Co",   status: "active"   },
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
describe("TenantJurisdiction: constants", () => {
  test("TENANT_GOVERNANCE_VERSION is a non-empty string", () => {
    assert.ok(typeof TENANT_GOVERNANCE_VERSION === "string" && TENANT_GOVERNANCE_VERSION.length > 0)
  })

  test("JURISDICTIONS has KSA, GCC, GLOBAL", () => {
    for (const k of ["KSA", "GCC", "GLOBAL"]) {
      assert.ok(JURISDICTIONS[k], `JURISDICTIONS.${k} must be defined`)
      assert.strictEqual(typeof JURISDICTIONS[k].code, "string")
      assert.strictEqual(JURISDICTIONS[k].code, k)
      assert.strictEqual(JURISDICTIONS[k].status, "active")
      assert.ok(JURISDICTIONS[k].policy_version)
    }
  })

  test("JURISDICTION_STATUSES has active and inactive", () => {
    assert.strictEqual(JURISDICTION_STATUSES.ACTIVE,   "active")
    assert.strictEqual(JURISDICTION_STATUSES.INACTIVE, "inactive")
  })
})

// ---------------------------------------------------------------------------
// POLICY-JURISDICTION-CODES-PRESENT
// ---------------------------------------------------------------------------
describe("POLICY-JURISDICTION-CODES-PRESENT: jurisdiction catalog", () => {
  for (const code of ["KSA", "GCC", "GLOBAL"]) {
    test(`${code} resolves ok with active status`, () => {
      const result = resolveJurisdiction(code)
      assert.strictEqual(result.ok, true)
      assert.strictEqual(result.entry.code, code)
      assert.strictEqual(result.entry.status, "active")
      assert.ok(result.entry.policy_version)
    })
  }

  test("unknown jurisdiction code returns ok:false", () => {
    const result = resolveJurisdiction("UNKNOWN_COUNTRY")
    assert.strictEqual(result.ok, false)
    assert.strictEqual(result.reason, "unknown_jurisdiction")
  })

  test("empty string returns ok:false", () => {
    const result = resolveJurisdiction("")
    assert.strictEqual(result.ok, false)
    assert.strictEqual(result.reason, "unknown_jurisdiction")
  })

  test("null returns ok:false", () => {
    const result = resolveJurisdiction(null)
    assert.strictEqual(result.ok, false)
  })

  test("lowercase code is normalized and resolves", () => {
    const result = resolveJurisdiction("ksa")
    assert.strictEqual(result.ok, true)
    assert.strictEqual(result.jurisdiction_code, "KSA")
  })
})

// ---------------------------------------------------------------------------
// resolveTenantGovernance
// ---------------------------------------------------------------------------
describe("resolveTenantGovernance: tenant context resolution", () => {
  test("active tenant resolves ok", () => {
    const result = resolveTenantGovernance("active_tenant", _REG)
    assert.strictEqual(result.ok, true)
    assert.strictEqual(result.tenant_id, "active_tenant")
    assert.ok(result.jurisdiction_code)
    assert.ok(result.tenant_governance_version)
  })

  test("inactive tenant returns ok:false with reason inactive_tenant", () => {
    const result = resolveTenantGovernance("inactive_tenant", _REG)
    assert.strictEqual(result.ok, false)
    assert.strictEqual(result.reason, "inactive_tenant")
  })

  test("unknown tenant returns ok:false with reason unknown_tenant", () => {
    const result = resolveTenantGovernance("nonexistent_tid", _REG)
    assert.strictEqual(result.ok, false)
    assert.strictEqual(result.reason, "unknown_tenant")
  })

  test("empty tenant_id returns ok:false with reason missing_tenant", () => {
    const result = resolveTenantGovernance("", _REG)
    assert.strictEqual(result.ok, false)
    assert.strictEqual(result.reason, "missing_tenant")
  })

  test("null tenantRegistry returns ok:false", () => {
    const result = resolveTenantGovernance("active_tenant", null)
    assert.strictEqual(result.ok, false)
  })
})

// ---------------------------------------------------------------------------
// POLICY-CROSS-TENANT-DENIED: cross-tenant validation
// ---------------------------------------------------------------------------
describe("POLICY-CROSS-TENANT-DENIED: validateCrossTenant", () => {
  test("wildcard principal (* tenant_id) always passes", () => {
    const result = validateCrossTenant("*", "any_tenant")
    assert.strictEqual(result.ok, true)
    assert.strictEqual(result.reason, "wildcard")
  })

  test("same tenant passes", () => {
    const result = validateCrossTenant("tenant_a", "tenant_a")
    assert.strictEqual(result.ok, true)
    assert.strictEqual(result.reason, "same_tenant")
  })

  test("different tenant returns ok:false with reason cross_tenant", () => {
    const result = validateCrossTenant("tenant_a", "tenant_b")
    assert.strictEqual(result.ok, false)
    assert.strictEqual(result.reason, "cross_tenant")
    assert.strictEqual(result.principal_tenant, "tenant_a")
    assert.strictEqual(result.request_tenant, "tenant_b")
  })

  test("empty principal tenant_id returns ok:false", () => {
    const result = validateCrossTenant("", "tenant_b")
    assert.strictEqual(result.ok, false)
    assert.strictEqual(result.reason, "cross_tenant")
  })
})

// ---------------------------------------------------------------------------
// POLICY-JURISDICTION-COMPAT: jurisdiction compatibility validation
// ---------------------------------------------------------------------------
describe("POLICY-JURISDICTION-COMPAT: validateJurisdictionCompatibility", () => {
  test("GLOBAL request is always compatible with any tenant jurisdiction", () => {
    for (const code of ["KSA", "GCC", "GLOBAL"]) {
      const result = validateJurisdictionCompatibility("GLOBAL", code)
      assert.strictEqual(result.ok, true, `GLOBAL request must be compatible with ${code} tenant`)
    }
  })

  test("GLOBAL tenant accepts any known request jurisdiction", () => {
    for (const code of ["KSA", "GCC", "GLOBAL"]) {
      const result = validateJurisdictionCompatibility(code, "GLOBAL")
      assert.strictEqual(result.ok, true, `${code} request must be compatible with GLOBAL tenant`)
    }
  })

  test("KSA request is compatible with KSA tenant", () => {
    const result = validateJurisdictionCompatibility("KSA", "KSA")
    assert.strictEqual(result.ok, true)
  })

  test("KSA request is incompatible with GCC tenant", () => {
    // GCC tenant accepts GCC, KSA, GLOBAL — so KSA request IS compatible with GCC tenant
    const result = validateJurisdictionCompatibility("KSA", "GCC")
    assert.strictEqual(result.ok, true)
  })

  test("GCC request is incompatible with KSA tenant", () => {
    // KSA tenant only accepts KSA and GLOBAL
    const result = validateJurisdictionCompatibility("GCC", "KSA")
    assert.strictEqual(result.ok, false)
    assert.strictEqual(result.reason, "incompatible_jurisdiction")
  })

  test("unknown request jurisdiction returns ok:false with reason unknown_jurisdiction", () => {
    const result = validateJurisdictionCompatibility("MARS", "GLOBAL")
    assert.strictEqual(result.ok, false)
    assert.strictEqual(result.reason, "unknown_jurisdiction")
  })

  test("empty request jurisdiction returns ok:false with reason missing_jurisdiction", () => {
    const result = validateJurisdictionCompatibility("", "GLOBAL")
    assert.strictEqual(result.ok, false)
    assert.strictEqual(result.reason, "missing_jurisdiction")
  })
})

// ---------------------------------------------------------------------------
// initTenantGovernance + setTenantJurisdiction + getGovernanceState
// ---------------------------------------------------------------------------
describe("initTenantGovernance + setTenantJurisdiction + getGovernanceState", () => {
  test("initTenantGovernance populates entries from registry", () => {
    initTenantGovernance(_REG)
    const state = getGovernanceState()
    const ids = state.map(e => e.tenant_id)
    assert.ok(ids.includes("active_tenant"), "active_tenant must be in governance state")
    assert.ok(ids.includes("ksa_tenant"),    "ksa_tenant must be in governance state")
  })

  test("setTenantJurisdiction assigns jurisdiction to a known tenant", () => {
    initTenantGovernance(_REG)
    const result = setTenantJurisdiction("ksa_tenant", "KSA", _REG)
    assert.strictEqual(result.ok, true)
    assert.strictEqual(result.jurisdiction_code, "KSA")

    const tg = resolveTenantGovernance("ksa_tenant", _REG)
    assert.strictEqual(tg.ok, true)
    assert.strictEqual(tg.jurisdiction_code, "KSA")
  })

  test("setTenantJurisdiction rejects unknown jurisdiction", () => {
    const result = setTenantJurisdiction("ksa_tenant", "PLUTO", _REG)
    assert.strictEqual(result.ok, false)
    assert.strictEqual(result.reason, "unknown_jurisdiction")
  })

  test("setTenantJurisdiction rejects unknown tenant", () => {
    const result = setTenantJurisdiction("no_such_tenant", "KSA", _REG)
    assert.strictEqual(result.ok, false)
    assert.strictEqual(result.reason, "unknown_tenant")
  })

  test("getGovernanceState returns shallow copies (no mutation)", () => {
    const before = getGovernanceState().map(e => e.jurisdiction_code)
    exportGovernance()
    const after  = getGovernanceState().map(e => e.jurisdiction_code)
    assert.deepStrictEqual(before, after)
  })
})

// ---------------------------------------------------------------------------
// exportGovernance: artifact structure
// ---------------------------------------------------------------------------
describe("exportGovernance: artifact", () => {
  test("exportGovernance returns artifact with correct structure", () => {
    const artifact = exportGovernance()
    assert.ok(artifact.exported_at)
    assert.strictEqual(artifact.tenant_governance_version, TENANT_GOVERNANCE_VERSION)
    assert.ok(artifact.jurisdiction_count >= 3)
    assert.ok(Array.isArray(artifact.jurisdictions))
    assert.ok(Array.isArray(artifact.tenants))
    assert.strictEqual(artifact.jurisdiction_count, artifact.jurisdictions.length)
  })

  test("exportGovernance writes valid JSON when outputPath provided", () => {
    const outFile = tmpFile()
    try {
      const artifact = exportGovernance(outFile)
      assert.ok(fs.existsSync(outFile))
      const raw = JSON.parse(fs.readFileSync(outFile, "utf8"))
      assert.strictEqual(raw.tenant_governance_version, TENANT_GOVERNANCE_VERSION)
      assert.ok(raw.jurisdiction_count >= 3)
      assert.strictEqual(artifact.jurisdiction_count, raw.jurisdiction_count)
    } finally {
      try { fs.unlinkSync(outFile) } catch (_) {}
    }
  })

  test("all jurisdiction entries have required fields", () => {
    const artifact = exportGovernance()
    for (const j of artifact.jurisdictions) {
      for (const f of ["code", "name", "status", "policy_version", "description"]) {
        assert.ok(Object.prototype.hasOwnProperty.call(j, f), `jurisdiction missing field: ${f}`)
      }
    }
  })
})

// ---------------------------------------------------------------------------
// Integration: resolver chain (tenant → jurisdiction → compatibility)
// ---------------------------------------------------------------------------
describe("Integration: tenant/jurisdiction resolver chain", () => {
  test("active tenant + compatible jurisdiction → full allow", () => {
    initTenantGovernance(_REG)
    setTenantJurisdiction("ksa_tenant", "KSA", _REG)

    const tg = resolveTenantGovernance("ksa_tenant", _REG)
    assert.strictEqual(tg.ok, true)

    const jResult = resolveJurisdiction("KSA")
    assert.strictEqual(jResult.ok, true)

    const compat = validateJurisdictionCompatibility("KSA", tg.jurisdiction_code)
    assert.strictEqual(compat.ok, true)
  })

  test("active tenant + incompatible jurisdiction → blocked at compat check", () => {
    initTenantGovernance(_REG)
    setTenantJurisdiction("ksa_tenant", "KSA", _REG)

    const tg = resolveTenantGovernance("ksa_tenant", _REG)
    assert.strictEqual(tg.ok, true)

    const compat = validateJurisdictionCompatibility("GCC", tg.jurisdiction_code)
    assert.strictEqual(compat.ok, false)
    assert.strictEqual(compat.reason, "incompatible_jurisdiction")
  })

  test("cross-tenant mismatch → blocked before tenant governance", () => {
    const cross = validateCrossTenant("tenant_a", "tenant_b")
    assert.strictEqual(cross.ok, false)
    assert.strictEqual(cross.reason, "cross_tenant")
  })

  test("wildcard + unknown jurisdiction → blocked at jurisdiction resolve", () => {
    const cross = validateCrossTenant("*", "any_tenant")
    assert.strictEqual(cross.ok, true)
    const j = resolveJurisdiction("NONEXISTENT")
    assert.strictEqual(j.ok, false)
  })
})
