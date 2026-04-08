"use strict"

/**
 * PROWORK PHASE 14 — Sovereign Control Registry Unit Tests
 *
 * Covers:
 * - CONTROL_KEYS catalog completeness
 * - CONTROL_FAMILIES catalog completeness
 * - STATUSES constants
 * - resolveControl: active, disabled, unknown key, missing
 * - setControlStatus: valid transitions, invalid key, invalid status
 * - getRegistry: snapshot completeness
 * - exportRegistry: artifact structure and non-mutation
 * - loadRegistry: defaults are authoritative when no override file
 * - fail-closed semantics: disabled and unknown keys
 * - POLICY-REGISTRY-LOADED: all minimum required keys present
 * - POLICY-CONTROL-VERSION-PRESENT: sovereign.registry.version resolves
 * - POLICY-UNKNOWN-CONTROL-DENIED: unknown key fails closed
 * - POLICY-RUNTIME-GUARD-FAIL-CLOSED: runtime.guard.fail_closed.enabled resolves active
 */

const { test, describe, before, after } = require("node:test")
const assert  = require("node:assert")
const fs      = require("fs")
const os      = require("os")
const path    = require("path")
const crypto  = require("crypto")

const SR = require("../../app/lib/sovereign_registry")
const {
  CONTROL_KEYS,
  CONTROL_FAMILIES,
  STATUSES,
  REGISTRY_VERSION,
  resolveControl,
  setControlStatus,
  getRegistry,
  exportRegistry,
  loadRegistry,
} = SR

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function tmpFile(ext) {
  return path.join(os.tmpdir(), `prowork_sr_test_${crypto.randomUUID()}${ext || ".json"}`)
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
describe("SovereignRegistry: constants", () => {
  test("REGISTRY_VERSION is a non-empty string", () => {
    assert.ok(typeof REGISTRY_VERSION === "string" && REGISTRY_VERSION.length > 0)
  })

  test("CONTROL_KEYS has all required minimum keys", () => {
    const required = [
      "OPS_OVERRIDE_REQUIRES_APPROVAL",
      "OPS_FORCE_EXECUTE_REQUIRES_APPROVAL",
      "ADMIN_CONFIG_CHANGE_REQUIRES_APPROVAL",
      "PRIVILEGED_AUDIT_REQUIRED",
      "PRIVILEGED_MAKER_CHECKER_REQUIRED",
      "SOVEREIGN_REGISTRY_VERSION",
      "RUNTIME_GUARD_FAIL_CLOSED",
    ]
    for (const k of required) {
      assert.ok(CONTROL_KEYS[k], `CONTROL_KEYS.${k} must be defined`)
      assert.ok(typeof CONTROL_KEYS[k] === "string" && CONTROL_KEYS[k].length > 0)
    }
  })

  test("CONTROL_FAMILIES has all required families", () => {
    const required = ["PRIVILEGED_OPERATION", "APPROVAL", "PERMISSION", "AUDIT", "RUNTIME_GUARD"]
    for (const k of required) {
      assert.ok(CONTROL_FAMILIES[k], `CONTROL_FAMILIES.${k} must be defined`)
    }
  })

  test("STATUSES has active, deprecated, disabled", () => {
    assert.strictEqual(STATUSES.ACTIVE,     "active")
    assert.strictEqual(STATUSES.DEPRECATED, "deprecated")
    assert.strictEqual(STATUSES.DISABLED,   "disabled")
  })
})

// ---------------------------------------------------------------------------
// POLICY-REGISTRY-LOADED: all minimum required keys present and active
// ---------------------------------------------------------------------------
describe("POLICY-REGISTRY-LOADED: built-in registry completeness", () => {
  const minRequiredKeys = [
    CONTROL_KEYS.OPS_OVERRIDE_REQUIRES_APPROVAL,
    CONTROL_KEYS.OPS_FORCE_EXECUTE_REQUIRES_APPROVAL,
    CONTROL_KEYS.ADMIN_CONFIG_CHANGE_REQUIRES_APPROVAL,
    CONTROL_KEYS.PRIVILEGED_AUDIT_REQUIRED,
    CONTROL_KEYS.PRIVILEGED_MAKER_CHECKER_REQUIRED,
    CONTROL_KEYS.SOVEREIGN_REGISTRY_VERSION,
    CONTROL_KEYS.RUNTIME_GUARD_FAIL_CLOSED,
  ]

  for (const key of minRequiredKeys) {
    test(`${key} resolves as active by default`, () => {
      const result = resolveControl(key)
      assert.strictEqual(result.ok, true, `${key} must resolve ok`)
      assert.ok(result.entry, `${key} must have entry`)
      assert.strictEqual(result.entry.status, STATUSES.ACTIVE)
      assert.ok(result.control_version, `${key} must have control_version`)
    })
  }

  test("getRegistry returns at least 7 entries", () => {
    const entries = getRegistry()
    assert.ok(entries.length >= 7, `expected >=7 entries, got ${entries.length}`)
  })

  test("all registry entries have required fields", () => {
    const required = [
      "control_key", "control_family", "control_version", "status",
      "value", "description", "source", "created_at", "evidence_version"
    ]
    for (const entry of getRegistry()) {
      for (const f of required) {
        assert.ok(Object.prototype.hasOwnProperty.call(entry, f), `entry ${entry.control_key} missing field: ${f}`)
      }
    }
  })
})

// ---------------------------------------------------------------------------
// POLICY-CONTROL-VERSION-PRESENT
// ---------------------------------------------------------------------------
describe("POLICY-CONTROL-VERSION-PRESENT: sovereign.registry.version control", () => {
  test("sovereign.registry.version resolves with control_version", () => {
    const result = resolveControl(CONTROL_KEYS.SOVEREIGN_REGISTRY_VERSION)
    assert.strictEqual(result.ok, true)
    assert.ok(result.control_version)
    assert.strictEqual(result.entry.value, REGISTRY_VERSION)
  })
})

// ---------------------------------------------------------------------------
// POLICY-RUNTIME-GUARD-FAIL-CLOSED
// ---------------------------------------------------------------------------
describe("POLICY-RUNTIME-GUARD-FAIL-CLOSED: runtime.guard.fail_closed.enabled", () => {
  test("runtime.guard.fail_closed.enabled resolves active with value true", () => {
    const result = resolveControl(CONTROL_KEYS.RUNTIME_GUARD_FAIL_CLOSED)
    assert.strictEqual(result.ok, true)
    assert.strictEqual(result.entry.value, true)
    assert.strictEqual(result.entry.status, STATUSES.ACTIVE)
  })
})

// ---------------------------------------------------------------------------
// POLICY-UNKNOWN-CONTROL-DENIED: unknown key fails closed
// ---------------------------------------------------------------------------
describe("POLICY-UNKNOWN-CONTROL-DENIED: unknown key handling", () => {
  test("unknown control key returns ok:false with reason unknown_key", () => {
    const result = resolveControl("nonexistent.control.key")
    assert.strictEqual(result.ok, false)
    assert.strictEqual(result.reason, "unknown_key")
    assert.strictEqual(result.control_key, "nonexistent.control.key")
    assert.strictEqual(result.control_version, null)
  })

  test("empty string key returns ok:false", () => {
    const result = resolveControl("")
    assert.strictEqual(result.ok, false)
    assert.strictEqual(result.reason, "unknown_key")
  })

  test("null key returns ok:false", () => {
    const result = resolveControl(null)
    assert.strictEqual(result.ok, false)
  })
})

// ---------------------------------------------------------------------------
// POLICY-OVERRIDE-DENY-MISSING-CONTROL: disabled status blocks resolution
// ---------------------------------------------------------------------------
describe("setControlStatus + resolveControl: disabled control fails closed", () => {
  // Use a scratch key to avoid affecting other tests (test order matters for in-memory state)
  // We'll test with RUNTIME_GUARD_FAIL_CLOSED, then re-enable after.

  test("disabling a control makes resolveControl return ok:false with reason disabled", () => {
    // Temporarily disable
    const disableResult = setControlStatus(CONTROL_KEYS.RUNTIME_GUARD_FAIL_CLOSED, STATUSES.DISABLED)
    assert.strictEqual(disableResult.ok, true)

    const resolved = resolveControl(CONTROL_KEYS.RUNTIME_GUARD_FAIL_CLOSED)
    assert.strictEqual(resolved.ok, false)
    assert.strictEqual(resolved.reason, "disabled")

    // Re-enable
    setControlStatus(CONTROL_KEYS.RUNTIME_GUARD_FAIL_CLOSED, STATUSES.ACTIVE)
    const restored = resolveControl(CONTROL_KEYS.RUNTIME_GUARD_FAIL_CLOSED)
    assert.strictEqual(restored.ok, true)
  })

  test("setControlStatus rejects unknown key", () => {
    const result = setControlStatus("no.such.key", STATUSES.DISABLED)
    assert.strictEqual(result.ok, false)
    assert.strictEqual(result.reason, "unknown_key")
  })

  test("setControlStatus rejects invalid status string", () => {
    const result = setControlStatus(CONTROL_KEYS.PRIVILEGED_AUDIT_REQUIRED, "totally_invalid")
    assert.strictEqual(result.ok, false)
    assert.strictEqual(result.reason, "invalid_status")
  })
})

// ---------------------------------------------------------------------------
// POLICY-MAKER-CHECKER-ENFORCED-FROM-REGISTRY
// ---------------------------------------------------------------------------
describe("POLICY-MAKER-CHECKER-ENFORCED-FROM-REGISTRY", () => {
  test("privileged.approval.maker_checker.required resolves active with value true", () => {
    const result = resolveControl(CONTROL_KEYS.PRIVILEGED_MAKER_CHECKER_REQUIRED)
    assert.strictEqual(result.ok, true)
    assert.strictEqual(result.entry.value, true)
    assert.strictEqual(result.entry.control_family, CONTROL_FAMILIES.APPROVAL)
  })
})

// ---------------------------------------------------------------------------
// POLICY-AUDIT-REQUIRED-ENFORCED-FROM-REGISTRY
// ---------------------------------------------------------------------------
describe("POLICY-AUDIT-REQUIRED-ENFORCED-FROM-REGISTRY", () => {
  test("privileged.audit.required resolves active with value true", () => {
    const result = resolveControl(CONTROL_KEYS.PRIVILEGED_AUDIT_REQUIRED)
    assert.strictEqual(result.ok, true)
    assert.strictEqual(result.entry.value, true)
    assert.strictEqual(result.entry.control_family, CONTROL_FAMILIES.AUDIT)
  })
})

// ---------------------------------------------------------------------------
// POLICY-REGISTRY-EXPORT-GENERATED: exportRegistry artifact
// ---------------------------------------------------------------------------
describe("POLICY-REGISTRY-EXPORT-GENERATED: exportRegistry", () => {
  test("exportRegistry writes JSON artifact with correct structure", () => {
    const outFile = tmpFile()
    try {
      const artifact = exportRegistry(outFile)
      assert.ok(artifact.exported_at)
      assert.strictEqual(artifact.registry_version, REGISTRY_VERSION)
      assert.ok(artifact.control_count >= 7)
      assert.ok(Array.isArray(artifact.entries))
      assert.strictEqual(artifact.entries.length, artifact.control_count)

      const raw = JSON.parse(fs.readFileSync(outFile, "utf8"))
      assert.strictEqual(raw.registry_version, REGISTRY_VERSION)
      assert.ok(raw.control_count >= 7)
    } finally {
      try { fs.unlinkSync(outFile) } catch (_) {}
    }
  })

  test("exportRegistry without outputPath returns artifact without writing file", () => {
    const artifact = exportRegistry()  // no outputPath
    assert.ok(artifact.exported_at)
    assert.ok(artifact.control_count >= 7)
  })

  test("export does not mutate in-memory registry state", () => {
    const before = getRegistry().map(e => e.status)
    exportRegistry()
    const after  = getRegistry().map(e => e.status)
    assert.deepStrictEqual(before, after)
  })
})

// ---------------------------------------------------------------------------
// loadRegistry: defaults are authoritative; override file merges status/value only
// ---------------------------------------------------------------------------
describe("loadRegistry: override file behavior", () => {
  test("loadRegistry with missing file keeps defaults", () => {
    loadRegistry("/nonexistent/path/sovereign_registry.json")
    const result = resolveControl(CONTROL_KEYS.OPS_OVERRIDE_REQUIRES_APPROVAL)
    assert.strictEqual(result.ok, true)
  })

  test("loadRegistry with malformed JSON keeps defaults", () => {
    const badFile = tmpFile()
    try {
      fs.writeFileSync(badFile, "{ not valid json }", "utf8")
      loadRegistry(badFile)
      const result = resolveControl(CONTROL_KEYS.OPS_OVERRIDE_REQUIRES_APPROVAL)
      assert.strictEqual(result.ok, true)
    } finally {
      try { fs.unlinkSync(badFile) } catch (_) {}
    }
  })
})

// ---------------------------------------------------------------------------
// Integration: resolveControl used as a gate (simulating requireSovereignControl)
// ---------------------------------------------------------------------------
describe("Integration: registry gate pattern", () => {
  test("active control gates pass through", () => {
    const keys = [
      CONTROL_KEYS.OPS_OVERRIDE_REQUIRES_APPROVAL,
      CONTROL_KEYS.OPS_FORCE_EXECUTE_REQUIRES_APPROVAL,
      CONTROL_KEYS.ADMIN_CONFIG_CHANGE_REQUIRES_APPROVAL,
    ]
    for (const key of keys) {
      const result = resolveControl(key)
      assert.strictEqual(result.ok, true, `${key} should pass gate`)
      assert.ok(result.control_version, `${key} must carry control_version`)
    }
  })

  test("unknown control blocks gate", () => {
    const result = resolveControl("ops.unknown.action.requires_approval")
    assert.strictEqual(result.ok, false)
    assert.strictEqual(result.reason, "unknown_key")
  })

  test("disabled control blocks gate and reason is disabled", () => {
    setControlStatus(CONTROL_KEYS.OPS_FORCE_EXECUTE_REQUIRES_APPROVAL, STATUSES.DISABLED)
    const result = resolveControl(CONTROL_KEYS.OPS_FORCE_EXECUTE_REQUIRES_APPROVAL)
    assert.strictEqual(result.ok, false)
    assert.strictEqual(result.reason, "disabled")
    // Restore
    setControlStatus(CONTROL_KEYS.OPS_FORCE_EXECUTE_REQUIRES_APPROVAL, STATUSES.ACTIVE)
  })
})
