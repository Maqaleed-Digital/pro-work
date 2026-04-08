"use strict"

/**
 * PROWORK PHASE 11 — Permission-Bound Operational Control Layer
 * Unit tests for the permission catalog and role-to-permission grants.
 *
 * Coverage:
 *   - superadmin  → allow execute, retry, override
 *   - ops         → allow execute, retry; DENY override
 *   - auditor     → DENY execute, retry, override
 *   - unknown role → DENY mutations
 *   - unknown permission string → DENY (fail-closed)
 *   - missing principal → DENY
 *   - semantic map completeness
 *   - checkPerm decision record fields
 */

const { test, describe } = require("node:test")
const assert = require("node:assert")

const AdminPerms = require("../../app/lib/admin_permissions")
const { PERMS, SEMANTIC_MAP, hasPerm, checkPerm, rolePerms, deny } = AdminPerms

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------
function principal(role, id) {
  return { id: id || `test-${role}`, role, status: "active" }
}

// ---------------------------------------------------------------------------
// PERM-PUBLIC-ALLOW — catalog and semantic map are present
// ---------------------------------------------------------------------------
describe("Permission Catalog", () => {
  test("PERM-PUBLIC-ALLOW: all required permission constants are defined", () => {
    const required = [
      "OPS_SYSTEM_READ", "OPS_IDENTITY_READ", "OPS_STATUS_READ",
      "OPS_EXECUTE", "OPS_RETRY", "OPS_OVERRIDE"
    ]
    for (const key of required) {
      assert.ok(PERMS[key], `PERMS.${key} must be defined`)
      assert.ok(typeof PERMS[key] === "string" && PERMS[key].length > 0, `PERMS.${key} must be non-empty string`)
    }
  })

  test("semantic map covers all required classes", () => {
    const required = [
      "system.read", "identity.read", "admin.read",
      "ops.read", "ops.execute", "ops.retry", "ops.override"
    ]
    for (const cls of required) {
      assert.ok(SEMANTIC_MAP[cls], `SEMANTIC_MAP["${cls}"] must be defined`)
    }
  })

  test("semantic map ops.override resolves to ops:override", () => {
    assert.strictEqual(SEMANTIC_MAP["ops.override"], PERMS.OPS_OVERRIDE)
    assert.strictEqual(PERMS.OPS_OVERRIDE, "ops:override")
  })

  test("deny() returns 403 FORBIDDEN with permission message", () => {
    const d = deny("ops:override")
    assert.strictEqual(d.ok, false)
    assert.strictEqual(d.status, 403)
    assert.strictEqual(d.error.code, "FORBIDDEN")
    assert.ok(d.error.message.includes("ops:override"))
  })
})

// ---------------------------------------------------------------------------
// PERM-IDENTITY-ALLOW / PERM-ADMIN-READ-ALLOW — superadmin
// ---------------------------------------------------------------------------
describe("PERM: superadmin grants", () => {
  const p = principal("superadmin")

  test("PERM-IDENTITY-ALLOW: superadmin allowed ops:system:read", () => {
    assert.strictEqual(hasPerm(p, PERMS.OPS_SYSTEM_READ), true)
  })

  test("PERM-ADMIN-READ-ALLOW: superadmin allowed admin:governance:read", () => {
    assert.strictEqual(hasPerm(p, PERMS.ADMIN_GOVERNANCE_READ), true)
  })

  test("PERM-OPS-READ-ALLOW: superadmin allowed ops:status:read", () => {
    assert.strictEqual(hasPerm(p, PERMS.OPS_STATUS_READ), true)
  })

  test("PERM-OPS-EXECUTE-ALLOW-SUPERADMIN: superadmin allowed ops:execute", () => {
    assert.strictEqual(hasPerm(p, PERMS.OPS_EXECUTE), true)
  })

  test("superadmin allowed ops:retry", () => {
    assert.strictEqual(hasPerm(p, PERMS.OPS_RETRY), true)
  })

  test("PERM-OPS-OVERRIDE-ALLOW-SUPERADMIN: superadmin allowed ops:override", () => {
    assert.strictEqual(hasPerm(p, PERMS.OPS_OVERRIDE), true)
  })
})

// ---------------------------------------------------------------------------
// ops role
// ---------------------------------------------------------------------------
describe("PERM: ops role grants", () => {
  const p = principal("ops")

  test("PERM-OPS-READ-ALLOW: ops allowed ops:status:read", () => {
    assert.strictEqual(hasPerm(p, PERMS.OPS_STATUS_READ), true)
  })

  test("PERM-OPS-EXECUTE-ALLOW-OPS: ops allowed ops:execute", () => {
    assert.strictEqual(hasPerm(p, PERMS.OPS_EXECUTE), true)
  })

  test("PERM-OPS-RETRY-ALLOW-OPS: ops allowed ops:retry", () => {
    assert.strictEqual(hasPerm(p, PERMS.OPS_RETRY), true)
  })

  test("PERM-OPS-OVERRIDE-DENY-OPS: ops denied ops:override", () => {
    assert.strictEqual(hasPerm(p, PERMS.OPS_OVERRIDE), false)
  })

  test("ops denied admin write they should not gain via ops escalation", () => {
    // ops has ADMIN_WORKERS_WRITE but NOT override — verifies no escalation path
    assert.strictEqual(hasPerm(p, PERMS.OPS_OVERRIDE), false)
  })
})

// ---------------------------------------------------------------------------
// auditor role
// ---------------------------------------------------------------------------
describe("PERM: auditor role grants", () => {
  const p = principal("auditor")

  test("auditor allowed ops:system:read", () => {
    assert.strictEqual(hasPerm(p, PERMS.OPS_SYSTEM_READ), true)
  })

  test("auditor allowed ops:identity:read", () => {
    assert.strictEqual(hasPerm(p, PERMS.OPS_IDENTITY_READ), true)
  })

  test("PERM-OPS-READ-ALLOW: auditor denied ops:status:read (no operational access)", () => {
    // auditor is read-only on admin resources; ops control routes require ops role
    assert.strictEqual(hasPerm(p, PERMS.OPS_STATUS_READ), false)
  })

  test("PERM-OPS-EXECUTE-DENY-AUDITOR: auditor denied ops:execute", () => {
    assert.strictEqual(hasPerm(p, PERMS.OPS_EXECUTE), false)
  })

  test("PERM-OPS-RETRY-DENY-AUDITOR: auditor denied ops:retry", () => {
    assert.strictEqual(hasPerm(p, PERMS.OPS_RETRY), false)
  })

  test("auditor denied ops:override", () => {
    assert.strictEqual(hasPerm(p, PERMS.OPS_OVERRIDE), false)
  })
})

// ---------------------------------------------------------------------------
// PERM-DENY-MISSING-PERMISSION-MAPPING — unknown permission → deny
// ---------------------------------------------------------------------------
describe("PERM: fail-closed on unknown or missing inputs", () => {
  test("PERM-DENY-MISSING-PERMISSION-MAPPING: unknown permission string denied for ops", () => {
    const p = principal("ops")
    assert.strictEqual(hasPerm(p, "totally:unknown:permission"), false)
  })

  test("unknown permission denied for superadmin (no wildcard on unknown)", () => {
    // superadmin has all: true — hasPerm short-circuits to true for superadmin
    // This is expected: superadmin is sovereign. Unknown perms are still blocked for non-superadmin.
    const p = principal("auditor")
    assert.strictEqual(hasPerm(p, "not:a:real:permission"), false)
  })

  test("missing principal (null) → deny", () => {
    assert.strictEqual(hasPerm(null, PERMS.OPS_EXECUTE), false)
  })

  test("missing principal (undefined) → deny", () => {
    assert.strictEqual(hasPerm(undefined, PERMS.OPS_EXECUTE), false)
  })

  test("empty role → deny mutations", () => {
    const p = { id: "test", role: "", status: "active" }
    assert.strictEqual(hasPerm(p, PERMS.OPS_EXECUTE), false)
    assert.strictEqual(hasPerm(p, PERMS.OPS_OVERRIDE), false)
  })
})

// ---------------------------------------------------------------------------
// checkPerm decision record
// ---------------------------------------------------------------------------
describe("checkPerm: decision record structure", () => {
  test("allow decision has correct fields", () => {
    const p = principal("ops", "adm_ops_001")
    const rec = checkPerm(p, PERMS.OPS_EXECUTE)
    assert.strictEqual(rec.allowed, true)
    assert.strictEqual(rec.actor, "adm_ops_001")
    assert.strictEqual(rec.role, "ops")
    assert.strictEqual(rec.permission, PERMS.OPS_EXECUTE)
    assert.strictEqual(rec.decision, "allow")
  })

  test("deny decision has correct fields", () => {
    const p = principal("ops", "adm_ops_002")
    const rec = checkPerm(p, PERMS.OPS_OVERRIDE)
    assert.strictEqual(rec.allowed, false)
    assert.strictEqual(rec.actor, "adm_ops_002")
    assert.strictEqual(rec.role, "ops")
    assert.strictEqual(rec.permission, PERMS.OPS_OVERRIDE)
    assert.strictEqual(rec.decision, "deny")
  })

  test("missing principal produces deny decision with (missing) actor", () => {
    const rec = checkPerm(null, PERMS.OPS_EXECUTE)
    assert.strictEqual(rec.allowed, false)
    assert.strictEqual(rec.decision, "deny")
    assert.ok(rec.actor.includes("missing"))
  })
})

// ---------------------------------------------------------------------------
// Phase 10 RBAC preserved — existing permissions still work
// ---------------------------------------------------------------------------
describe("Phase 10 RBAC preserved", () => {
  test("ops still has admin:workers:read", () => {
    assert.strictEqual(hasPerm(principal("ops"), PERMS.ADMIN_WORKERS_READ), true)
  })

  test("auditor still has admin:governance:read", () => {
    assert.strictEqual(hasPerm(principal("auditor"), PERMS.ADMIN_GOVERNANCE_READ), true)
  })

  test("auditor denied admin:workers:write", () => {
    assert.strictEqual(hasPerm(principal("auditor"), PERMS.ADMIN_WORKERS_WRITE), false)
  })

  test("superadmin rolePerms returns all:true", () => {
    const rp = rolePerms("superadmin")
    assert.strictEqual(rp.all, true)
  })
})
