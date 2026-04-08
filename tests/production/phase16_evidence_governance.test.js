"use strict"

/**
 * PROWORK PHASE 16 — Data Residency + Evidence Retention Governance Unit Tests
 *
 * Covers:
 * - RESIDENCY_REGIONS catalog completeness
 * - RETENTION_CLASSES catalog completeness
 * - EVIDENCE_GOVERNANCE_VERSION constant
 * - resolveResidency: active, unknown, null, lowercase normalization
 * - resolveRetention: active, unknown, inactive (after setRetentionStatus)
 * - validateResidencyCompatibility: GLOBAL residency, GLOBAL jurisdiction, KSA rules, GCC rules, incompatible
 * - setRetentionStatus: valid disable/enable, unknown class, invalid status
 * - getGovernanceState: snapshot completeness, reflects overrides
 * - exportGovernance: artifact structure and non-mutation
 * - POLICY-RESIDENCY-CODES-PRESENT: KSA, GCC, GLOBAL exist
 * - POLICY-RETENTION-CLASSES-PRESENT: all four classes exist
 * - POLICY-RESIDENCY-COMPAT: GLOBAL always passes, incompatible denied
 */

const { test, describe } = require("node:test")
const assert = require("node:assert")
const fs     = require("fs")
const os     = require("os")
const path   = require("path")
const crypto = require("crypto")

const EG = require("../../app/lib/evidence_governance")
const {
  EVIDENCE_GOVERNANCE_VERSION,
  RESIDENCY_REGIONS,
  RESIDENCY_STATUSES,
  RETENTION_CLASSES,
  resolveResidency,
  resolveRetention,
  validateResidencyCompatibility,
  setRetentionStatus,
  getGovernanceState,
  exportGovernance,
} = EG

function tmpFile() {
  return path.join(os.tmpdir(), `prowork_eg_test_${crypto.randomUUID()}.json`)
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
describe("EvidenceGovernance: constants", () => {
  test("EVIDENCE_GOVERNANCE_VERSION is a non-empty string", () => {
    assert.ok(typeof EVIDENCE_GOVERNANCE_VERSION === "string" && EVIDENCE_GOVERNANCE_VERSION.length > 0)
  })

  test("RESIDENCY_REGIONS has KSA, GCC, GLOBAL", () => {
    for (const k of ["KSA", "GCC", "GLOBAL"]) {
      assert.ok(RESIDENCY_REGIONS[k], `RESIDENCY_REGIONS.${k} must be defined`)
      assert.strictEqual(RESIDENCY_REGIONS[k].region, k)
      assert.strictEqual(RESIDENCY_REGIONS[k].status, "active")
      assert.ok(RESIDENCY_REGIONS[k].policy_version)
    }
  })

  test("RETENTION_CLASSES has all four required classes", () => {
    const required = ["audit.short_term", "audit.long_term", "approval.long_term", "sovereign.control.long_term"]
    for (const k of required) {
      assert.ok(RETENTION_CLASSES[k], `RETENTION_CLASSES["${k}"] must be defined`)
      assert.strictEqual(RETENTION_CLASSES[k].retention_class, k)
      assert.strictEqual(RETENTION_CLASSES[k].status, "active")
      assert.ok(typeof RETENTION_CLASSES[k].retention_days === "number")
      assert.ok(RETENTION_CLASSES[k].policy_version)
    }
  })

  test("RESIDENCY_STATUSES has active and inactive", () => {
    assert.strictEqual(RESIDENCY_STATUSES.ACTIVE,   "active")
    assert.strictEqual(RESIDENCY_STATUSES.INACTIVE, "inactive")
  })
})

// ---------------------------------------------------------------------------
// POLICY-RESIDENCY-CODES-PRESENT
// ---------------------------------------------------------------------------
describe("POLICY-RESIDENCY-CODES-PRESENT: resolveResidency", () => {
  for (const code of ["KSA", "GCC", "GLOBAL"]) {
    test(`${code} resolves ok with active status`, () => {
      const result = resolveResidency(code)
      assert.strictEqual(result.ok, true)
      assert.strictEqual(result.entry.region, code)
      assert.strictEqual(result.entry.status, "active")
      assert.ok(result.entry.policy_version)
    })
  }

  test("unknown region returns ok:false with reason unknown_region", () => {
    const result = resolveResidency("ANTARCTICA")
    assert.strictEqual(result.ok, false)
    assert.strictEqual(result.reason, "unknown_region")
  })

  test("empty string returns ok:false", () => {
    const result = resolveResidency("")
    assert.strictEqual(result.ok, false)
    assert.strictEqual(result.reason, "unknown_region")
  })

  test("null returns ok:false", () => {
    const result = resolveResidency(null)
    assert.strictEqual(result.ok, false)
  })

  test("lowercase region is normalized and resolves", () => {
    const result = resolveResidency("ksa")
    assert.strictEqual(result.ok, true)
    assert.strictEqual(result.residency_region, "KSA")
  })
})

// ---------------------------------------------------------------------------
// POLICY-RETENTION-CLASSES-PRESENT: resolveRetention
// ---------------------------------------------------------------------------
describe("POLICY-RETENTION-CLASSES-PRESENT: resolveRetention", () => {
  for (const cls of ["audit.short_term", "audit.long_term", "approval.long_term", "sovereign.control.long_term"]) {
    test(`"${cls}" resolves ok with active status and retention_days`, () => {
      const result = resolveRetention(cls)
      assert.strictEqual(result.ok, true)
      assert.strictEqual(result.entry.retention_class, cls)
      assert.strictEqual(result.entry.status, "active")
      assert.ok(typeof result.entry.retention_days === "number")
    })
  }

  test("unknown retention class returns ok:false with reason unknown_retention_class", () => {
    const result = resolveRetention("no.such.class")
    assert.strictEqual(result.ok, false)
    assert.strictEqual(result.reason, "unknown_retention_class")
  })

  test("empty string returns ok:false", () => {
    const result = resolveRetention("")
    assert.strictEqual(result.ok, false)
  })

  test("null returns ok:false", () => {
    const result = resolveRetention(null)
    assert.strictEqual(result.ok, false)
  })
})

// ---------------------------------------------------------------------------
// setRetentionStatus + resolveRetention: disable/enable cycle
// ---------------------------------------------------------------------------
describe("setRetentionStatus: disable/enable retention class", () => {
  test("disabling a class makes resolveRetention return ok:false with reason inactive_retention_class", () => {
    const cls = "audit.short_term"
    const disableResult = setRetentionStatus(cls, "inactive")
    assert.strictEqual(disableResult.ok, true)
    assert.strictEqual(disableResult.status, "inactive")

    const resolved = resolveRetention(cls)
    assert.strictEqual(resolved.ok, false)
    assert.strictEqual(resolved.reason, "inactive_retention_class")

    // Re-enable
    setRetentionStatus(cls, "active")
    const restored = resolveRetention(cls)
    assert.strictEqual(restored.ok, true)
  })

  test("setRetentionStatus rejects unknown retention class", () => {
    const result = setRetentionStatus("no.such.class", "inactive")
    assert.strictEqual(result.ok, false)
    assert.strictEqual(result.reason, "unknown_retention_class")
  })

  test("setRetentionStatus rejects invalid status", () => {
    const result = setRetentionStatus("audit.long_term", "maybe")
    assert.strictEqual(result.ok, false)
    assert.strictEqual(result.reason, "invalid_status")
  })
})

// ---------------------------------------------------------------------------
// POLICY-RESIDENCY-COMPAT: validateResidencyCompatibility
// ---------------------------------------------------------------------------
describe("POLICY-RESIDENCY-COMPAT: validateResidencyCompatibility", () => {
  test("GLOBAL residency is always compatible with any jurisdiction", () => {
    for (const code of ["KSA", "GCC", "GLOBAL"]) {
      const result = validateResidencyCompatibility("GLOBAL", code)
      assert.strictEqual(result.ok, true, `GLOBAL residency must be compatible with ${code} jurisdiction`)
    }
  })

  test("GLOBAL jurisdiction accepts any known residency", () => {
    for (const code of ["KSA", "GCC", "GLOBAL"]) {
      const result = validateResidencyCompatibility(code, "GLOBAL")
      assert.strictEqual(result.ok, true, `${code} residency must be compatible with GLOBAL jurisdiction`)
    }
  })

  test("KSA residency is compatible with KSA jurisdiction", () => {
    const result = validateResidencyCompatibility("KSA", "KSA")
    assert.strictEqual(result.ok, true)
  })

  test("GCC residency is incompatible with KSA jurisdiction", () => {
    // KSA jurisdiction only accepts KSA or GLOBAL residency
    const result = validateResidencyCompatibility("GCC", "KSA")
    assert.strictEqual(result.ok, false)
    assert.strictEqual(result.reason, "incompatible_residency")
  })

  test("KSA residency is compatible with GCC jurisdiction", () => {
    // GCC jurisdiction accepts KSA, GCC, GLOBAL residency
    const result = validateResidencyCompatibility("KSA", "GCC")
    assert.strictEqual(result.ok, true)
  })

  test("GCC residency is compatible with GCC jurisdiction", () => {
    const result = validateResidencyCompatibility("GCC", "GCC")
    assert.strictEqual(result.ok, true)
  })

  test("unknown residency region returns ok:false with reason unknown_region", () => {
    const result = validateResidencyCompatibility("MARS", "GLOBAL")
    assert.strictEqual(result.ok, false)
    assert.strictEqual(result.reason, "unknown_region")
  })

  test("empty residency returns ok:false with reason missing_region", () => {
    const result = validateResidencyCompatibility("", "GLOBAL")
    assert.strictEqual(result.ok, false)
    assert.strictEqual(result.reason, "missing_region")
  })
})

// ---------------------------------------------------------------------------
// getGovernanceState: snapshot completeness and reflects overrides
// ---------------------------------------------------------------------------
describe("getGovernanceState: snapshot", () => {
  test("returns regions array with 3 entries", () => {
    const state = getGovernanceState()
    assert.ok(Array.isArray(state.regions))
    assert.strictEqual(state.regions.length, 3)
  })

  test("returns retention_classes array with 4 entries", () => {
    const state = getGovernanceState()
    assert.ok(Array.isArray(state.retention_classes))
    assert.strictEqual(state.retention_classes.length, 4)
  })

  test("reflects in-memory override after setRetentionStatus", () => {
    setRetentionStatus("approval.long_term", "inactive")
    const state = getGovernanceState()
    const cls = state.retention_classes.find(c => c.retention_class === "approval.long_term")
    assert.ok(cls)
    assert.strictEqual(cls.status, "inactive")
    // Restore
    setRetentionStatus("approval.long_term", "active")
    const after = getGovernanceState()
    const cls2 = after.retention_classes.find(c => c.retention_class === "approval.long_term")
    assert.strictEqual(cls2.status, "active")
  })

  test("all region entries have required fields", () => {
    const state = getGovernanceState()
    for (const r of state.regions) {
      for (const f of ["region", "name", "status", "policy_version", "description"]) {
        assert.ok(Object.prototype.hasOwnProperty.call(r, f), `region missing field: ${f}`)
      }
    }
  })

  test("all retention_class entries have required fields", () => {
    const state = getGovernanceState()
    for (const c of state.retention_classes) {
      for (const f of ["retention_class", "name", "status", "retention_days", "policy_version", "description"]) {
        assert.ok(Object.prototype.hasOwnProperty.call(c, f), `retention_class missing field: ${f}`)
      }
    }
  })
})

// ---------------------------------------------------------------------------
// exportGovernance: artifact structure
// ---------------------------------------------------------------------------
describe("exportGovernance: artifact", () => {
  test("returns artifact with correct structure without outputPath", () => {
    const artifact = exportGovernance()
    assert.ok(artifact.exported_at)
    assert.strictEqual(artifact.evidence_governance_version, EVIDENCE_GOVERNANCE_VERSION)
    assert.strictEqual(artifact.residency_region_count, 3)
    assert.strictEqual(artifact.retention_class_count, 4)
    assert.ok(Array.isArray(artifact.residency_regions))
    assert.ok(Array.isArray(artifact.retention_classes))
    assert.strictEqual(artifact.residency_regions.length, 3)
    assert.strictEqual(artifact.retention_classes.length, 4)
  })

  test("writes valid JSON file when outputPath provided", () => {
    const outFile = tmpFile()
    try {
      const artifact = exportGovernance(outFile)
      assert.ok(fs.existsSync(outFile))
      const raw = JSON.parse(fs.readFileSync(outFile, "utf8"))
      assert.strictEqual(raw.evidence_governance_version, EVIDENCE_GOVERNANCE_VERSION)
      assert.strictEqual(raw.residency_region_count, artifact.residency_region_count)
      assert.strictEqual(raw.retention_class_count, artifact.retention_class_count)
    } finally {
      try { fs.unlinkSync(outFile) } catch (_) {}
    }
  })

  test("export does not mutate in-memory governance state", () => {
    const before = getGovernanceState().retention_classes.map(c => c.status)
    exportGovernance()
    const after  = getGovernanceState().retention_classes.map(c => c.status)
    assert.deepStrictEqual(before, after)
  })
})

// ---------------------------------------------------------------------------
// Integration: resolver chain (residency → retention → compatibility)
// ---------------------------------------------------------------------------
describe("Integration: residency/retention resolver chain", () => {
  test("active residency + compatible jurisdiction + active retention → full allow", () => {
    const r = resolveResidency("KSA")
    assert.strictEqual(r.ok, true)

    const compat = validateResidencyCompatibility("KSA", "KSA")
    assert.strictEqual(compat.ok, true)

    const rc = resolveRetention("audit.long_term")
    assert.strictEqual(rc.ok, true)
    assert.ok(rc.entry.retention_days > 0)
  })

  test("incompatible residency → blocked at compatibility check", () => {
    const r = resolveResidency("GCC")
    assert.strictEqual(r.ok, true)

    const compat = validateResidencyCompatibility("GCC", "KSA")
    assert.strictEqual(compat.ok, false)
    assert.strictEqual(compat.reason, "incompatible_residency")
  })

  test("disabled retention class → blocked at retention resolve", () => {
    setRetentionStatus("audit.short_term", "inactive")
    const rc = resolveRetention("audit.short_term")
    assert.strictEqual(rc.ok, false)
    assert.strictEqual(rc.reason, "inactive_retention_class")
    // Restore
    setRetentionStatus("audit.short_term", "active")
  })

  test("sovereign.control.long_term has retention_days: -1 (indefinite)", () => {
    const rc = resolveRetention("sovereign.control.long_term")
    assert.strictEqual(rc.ok, true)
    assert.strictEqual(rc.entry.retention_days, -1)
  })
})
