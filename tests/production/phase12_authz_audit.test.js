"use strict"

/**
 * PROWORK PHASE 12 — Authorization Audit Unit Tests
 *
 * Covers:
 * - record schema generation and required fields
 * - append-only write + read-back
 * - append-only verification (count only grows)
 * - correlation_id and request_id generation format
 * - allow and deny record creation
 * - export artifact generation
 * - DECISION_TYPES and OUTCOMES constants
 * - Phase 11 permission layer integration (checkPerm + audit path)
 */

const { test, describe, before, after } = require("node:test")
const assert  = require("node:assert")
const fs      = require("fs")
const os      = require("os")
const path    = require("path")
const crypto  = require("crypto")

const AuthzAudit  = require("../../app/lib/authz_audit")
const AdminPerms  = require("../../app/lib/admin_permissions")

// ---------------------------------------------------------------------------
// Temp file helper
// ---------------------------------------------------------------------------
function tmpAuditFile() {
  return path.join(os.tmpdir(), `prowork_test_audit_${crypto.randomUUID()}.jsonl`)
}

// ---------------------------------------------------------------------------
// Schema and constants
// ---------------------------------------------------------------------------
describe("AuthzAudit: constants and schema", () => {
  test("AUDIT_VERSION is defined", () => {
    assert.ok(AuthzAudit.AUDIT_VERSION)
    assert.strictEqual(typeof AuthzAudit.AUDIT_VERSION, "string")
  })

  test("DECISION_TYPES covers all required types", () => {
    const required = ["ADMIN_READ", "OPS_READ", "OPS_EXECUTE", "OPS_RETRY", "OPS_OVERRIDE", "PERM_ALLOWED", "PERM_DENIED", "PERM_MISSING"]
    for (const k of required) {
      assert.ok(AuthzAudit.DECISION_TYPES[k], `DECISION_TYPES.${k} must be defined`)
    }
  })

  test("OUTCOMES has allow and deny", () => {
    assert.strictEqual(AuthzAudit.OUTCOMES.ALLOW, "allow")
    assert.strictEqual(AuthzAudit.OUTCOMES.DENY,  "deny")
  })
})

// ---------------------------------------------------------------------------
// ID generation
// ---------------------------------------------------------------------------
describe("AUDIT-TRACE-ID-PRESENT / AUDIT-CORRELATION-ID-PRESENT: ID generators", () => {
  test("generateAuditId produces unique aud_ prefixed IDs", () => {
    const a = AuthzAudit.generateAuditId()
    const b = AuthzAudit.generateAuditId()
    assert.ok(a.startsWith("aud_"), `expected aud_ prefix, got: ${a}`)
    assert.notStrictEqual(a, b, "IDs must be unique")
  })

  test("AUDIT-CORRELATION-ID-PRESENT: generateCorrelationId produces unique cid_ prefixed IDs", () => {
    const a = AuthzAudit.generateCorrelationId()
    const b = AuthzAudit.generateCorrelationId()
    assert.ok(a.startsWith("cid_"), `expected cid_ prefix, got: ${a}`)
    assert.notStrictEqual(a, b, "correlation IDs must be unique")
  })

  test("AUDIT-TRACE-ID-PRESENT: generateRequestId produces unique rid_ prefixed IDs", () => {
    const a = AuthzAudit.generateRequestId()
    const b = AuthzAudit.generateRequestId()
    assert.ok(a.startsWith("rid_"), `expected rid_ prefix, got: ${a}`)
    assert.notStrictEqual(a, b, "request IDs must be unique")
  })
})

// ---------------------------------------------------------------------------
// createRecord schema
// ---------------------------------------------------------------------------
describe("createRecord: required field completeness", () => {
  const rec = AuthzAudit.createRecord({
    correlation_id:      "cid_test-001",
    request_id:          "rid_test-001",
    route:               "ops.execute",
    method:              "POST",
    actor_id:            "adm_ops_001",
    resolved_role:       "ops",
    relevant_permission: "ops:execute",
    decision_type:       AuthzAudit.DECISION_TYPES.OPS_EXECUTE,
    decision_outcome:    AuthzAudit.OUTCOMES.ALLOW,
    status_code:         200,
    reason_code:         "permission_granted",
  })

  const REQUIRED_FIELDS = [
    "audit_record_id", "timestamp", "correlation_id", "request_id",
    "route", "method", "actor_id", "resolved_role", "relevant_permission",
    "decision_type", "decision_outcome", "status_code", "reason_code",
    "source_component", "evidence_version"
  ]

  for (const field of REQUIRED_FIELDS) {
    test(`record has required field: ${field}`, () => {
      assert.ok(Object.prototype.hasOwnProperty.call(rec, field), `missing field: ${field}`)
      assert.ok(rec[field] !== undefined && rec[field] !== null, `field ${field} must not be null/undefined`)
    })
  }

  test("audit_record_id has aud_ prefix", () => {
    assert.ok(rec.audit_record_id.startsWith("aud_"))
  })

  test("correlation_id preserved from input", () => {
    assert.strictEqual(rec.correlation_id, "cid_test-001")
  })

  test("decision_outcome is allow", () => {
    assert.strictEqual(rec.decision_outcome, "allow")
  })

  test("evidence_version matches AUDIT_VERSION", () => {
    assert.strictEqual(rec.evidence_version, AuthzAudit.AUDIT_VERSION)
  })
})

// ---------------------------------------------------------------------------
// AUDIT-AUTHZ-ALLOW-RECORDED / AUDIT-AUTHZ-DENY-RECORDED: append + read
// ---------------------------------------------------------------------------
describe("AUDIT-AUTHZ-ALLOW-RECORDED / AUDIT-AUTHZ-DENY-RECORDED: appendRecord + readRecords", () => {
  test("appendRecord writes a valid JSONL line", () => {
    const file = tmpAuditFile()
    try {
      const rec = AuthzAudit.createRecord({
        correlation_id: AuthzAudit.generateCorrelationId(),
        request_id:     AuthzAudit.generateRequestId(),
        route: "admin.governance", method: "GET",
        actor_id: "adm_sa_001", resolved_role: "superadmin",
        relevant_permission: "admin:governance:read",
        decision_type: AuthzAudit.DECISION_TYPES.ADMIN_READ,
        decision_outcome: AuthzAudit.OUTCOMES.ALLOW,
        status_code: 200, reason_code: "permission_granted",
      })
      AuthzAudit.appendRecord(rec, file)
      const raw = fs.readFileSync(file, "utf8")
      assert.ok(raw.trim().length > 0, "file must not be empty")
      const parsed = JSON.parse(raw.trim())
      assert.strictEqual(parsed.audit_record_id, rec.audit_record_id)
      assert.strictEqual(parsed.decision_outcome, "allow")
    } finally {
      try { fs.unlinkSync(file) } catch (_) {}
    }
  })

  test("AUDIT-AUTHZ-DENY-RECORDED: deny record written correctly", () => {
    const file = tmpAuditFile()
    try {
      const rec = AuthzAudit.createRecord({
        correlation_id: AuthzAudit.generateCorrelationId(),
        request_id:     AuthzAudit.generateRequestId(),
        route: "ops.override", method: "POST",
        actor_id: "adm_ops_001", resolved_role: "ops",
        relevant_permission: "ops:override",
        decision_type: AuthzAudit.DECISION_TYPES.OPS_OVERRIDE,
        decision_outcome: AuthzAudit.OUTCOMES.DENY,
        status_code: 403, reason_code: "missing_permission:ops:override",
      })
      AuthzAudit.appendRecord(rec, file)
      const records = AuthzAudit.readRecords(file)
      assert.strictEqual(records.length, 1)
      assert.strictEqual(records[0].decision_outcome, "deny")
      assert.strictEqual(records[0].status_code, 403)
    } finally {
      try { fs.unlinkSync(file) } catch (_) {}
    }
  })
})

// ---------------------------------------------------------------------------
// AUDIT-OPS-EXECUTE-ALLOW-RECORDED, AUDIT-OPS-RETRY-ALLOW-RECORDED,
// AUDIT-OPS-OVERRIDE-ALLOW-RECORDED, AUDIT-OPS-OVERRIDE-DENY-RECORDED
// ---------------------------------------------------------------------------
describe("Audit records for specific ops decision types", () => {
  const cases = [
    { label: "AUDIT-OPS-EXECUTE-ALLOW-RECORDED",  type: AuthzAudit.DECISION_TYPES.OPS_EXECUTE,  outcome: "allow", role: "ops",        perm: "ops:execute",  status: 200 },
    { label: "AUDIT-OPS-RETRY-ALLOW-RECORDED",    type: AuthzAudit.DECISION_TYPES.OPS_RETRY,    outcome: "allow", role: "ops",        perm: "ops:retry",    status: 200 },
    { label: "AUDIT-OPS-OVERRIDE-ALLOW-RECORDED", type: AuthzAudit.DECISION_TYPES.OPS_OVERRIDE, outcome: "allow", role: "superadmin", perm: "ops:override", status: 200 },
    { label: "AUDIT-OPS-OVERRIDE-DENY-RECORDED",  type: AuthzAudit.DECISION_TYPES.OPS_OVERRIDE, outcome: "deny",  role: "ops",        perm: "ops:override", status: 403 },
  ]

  for (const c of cases) {
    test(`${c.label}: record created with correct decision_type and outcome`, () => {
      const file = tmpAuditFile()
      try {
        const rec = AuthzAudit.createRecord({
          correlation_id: AuthzAudit.generateCorrelationId(),
          request_id:     AuthzAudit.generateRequestId(),
          route: "ops.test", method: "POST",
          actor_id: `adm_${c.role}_001`, resolved_role: c.role,
          relevant_permission: c.perm,
          decision_type: c.type,
          decision_outcome: c.outcome,
          status_code: c.status,
          reason_code: c.outcome === "allow" ? "permission_granted" : `missing_permission:${c.perm}`,
        })
        AuthzAudit.appendRecord(rec, file)
        const records = AuthzAudit.readRecords(file)
        assert.strictEqual(records.length, 1)
        assert.strictEqual(records[0].decision_type,    c.type)
        assert.strictEqual(records[0].decision_outcome, c.outcome)
        assert.strictEqual(records[0].resolved_role,    c.role)
        assert.ok(records[0].correlation_id.startsWith("cid_"))
        assert.ok(records[0].request_id.startsWith("rid_"))
      } finally {
        try { fs.unlinkSync(file) } catch (_) {}
      }
    })
  }
})

// ---------------------------------------------------------------------------
// AUDIT-MISSING-PERMISSION-MAPPING-DENY-RECORDED
// ---------------------------------------------------------------------------
describe("AUDIT-MISSING-PERMISSION-MAPPING-DENY-RECORDED", () => {
  test("auth failure (unauthenticated) produces deny record with status 401", () => {
    const file = tmpAuditFile()
    try {
      const rec = AuthzAudit.createRecord({
        correlation_id: AuthzAudit.generateCorrelationId(),
        request_id:     AuthzAudit.generateRequestId(),
        route: "ops.execute", method: "POST",
        actor_id: "(unauthenticated)", resolved_role: "(none)",
        relevant_permission: "ops:execute",
        decision_type: AuthzAudit.DECISION_TYPES.PERM_DENIED,
        decision_outcome: AuthzAudit.OUTCOMES.DENY,
        status_code: 401,
        reason_code: "authentication_failed",
      })
      AuthzAudit.appendRecord(rec, file)
      const records = AuthzAudit.readRecords(file)
      assert.strictEqual(records.length, 1)
      assert.strictEqual(records[0].decision_outcome, "deny")
      assert.strictEqual(records[0].status_code, 401)
      assert.strictEqual(records[0].actor_id, "(unauthenticated)")
    } finally {
      try { fs.unlinkSync(file) } catch (_) {}
    }
  })
})

// ---------------------------------------------------------------------------
// AUDIT-APPEND-ONLY-VERIFIED: multiple records, count only grows
// ---------------------------------------------------------------------------
describe("AUDIT-APPEND-ONLY-VERIFIED: append-only behavior", () => {
  test("multiple appendRecord calls produce multiple JSONL lines (one per record)", () => {
    const file = tmpAuditFile()
    try {
      const count = 5
      for (let i = 0; i < count; i++) {
        AuthzAudit.appendRecord(AuthzAudit.createRecord({
          correlation_id: AuthzAudit.generateCorrelationId(),
          request_id:     AuthzAudit.generateRequestId(),
          route: `ops.test.${i}`, method: "POST",
          actor_id: "adm_test", resolved_role: "ops",
          relevant_permission: "ops:execute",
          decision_type: AuthzAudit.DECISION_TYPES.OPS_EXECUTE,
          decision_outcome: AuthzAudit.OUTCOMES.ALLOW,
          status_code: 200, reason_code: "permission_granted",
        }), file)
      }
      const records = AuthzAudit.readRecords(file)
      assert.strictEqual(records.length, count, `expected ${count} records, got ${records.length}`)
      // Verify ordering preserved (routes are sequential)
      for (let i = 0; i < count; i++) {
        assert.strictEqual(records[i].route, `ops.test.${i}`)
      }
    } finally {
      try { fs.unlinkSync(file) } catch (_) {}
    }
  })

  test("countRecords grows monotonically on each append", () => {
    const file = tmpAuditFile()
    try {
      const before = AuthzAudit.countRecords(file)
      assert.strictEqual(before, 0)
      AuthzAudit.appendRecord(AuthzAudit.createRecord({
        correlation_id: AuthzAudit.generateCorrelationId(),
        request_id: AuthzAudit.generateRequestId(),
        route: "ops.execute", method: "POST",
        actor_id: "adm_001", resolved_role: "ops",
        relevant_permission: "ops:execute",
        decision_type: AuthzAudit.DECISION_TYPES.OPS_EXECUTE,
        decision_outcome: AuthzAudit.OUTCOMES.ALLOW,
        status_code: 200, reason_code: "permission_granted",
      }), file)
      const after1 = AuthzAudit.countRecords(file)
      assert.strictEqual(after1, 1)
      AuthzAudit.appendRecord(AuthzAudit.createRecord({
        correlation_id: AuthzAudit.generateCorrelationId(),
        request_id: AuthzAudit.generateRequestId(),
        route: "ops.override", method: "POST",
        actor_id: "adm_001", resolved_role: "ops",
        relevant_permission: "ops:override",
        decision_type: AuthzAudit.DECISION_TYPES.OPS_OVERRIDE,
        decision_outcome: AuthzAudit.OUTCOMES.DENY,
        status_code: 403, reason_code: "missing_permission:ops:override",
      }), file)
      const after2 = AuthzAudit.countRecords(file)
      assert.strictEqual(after2, 2)
    } finally {
      try { fs.unlinkSync(file) } catch (_) {}
    }
  })

  test("no in-place mutation: audit_record_ids are distinct across appends", () => {
    const file = tmpAuditFile()
    try {
      for (let i = 0; i < 3; i++) {
        AuthzAudit.appendRecord(AuthzAudit.createRecord({
          correlation_id: AuthzAudit.generateCorrelationId(),
          request_id: AuthzAudit.generateRequestId(),
          route: "admin.stats", method: "GET",
          actor_id: "adm_sa", resolved_role: "superadmin",
          relevant_permission: "admin:stats:read",
          decision_type: AuthzAudit.DECISION_TYPES.ADMIN_READ,
          decision_outcome: AuthzAudit.OUTCOMES.ALLOW,
          status_code: 200, reason_code: "permission_granted",
        }), file)
      }
      const records = AuthzAudit.readRecords(file)
      const ids = records.map(r => r.audit_record_id)
      const unique = new Set(ids)
      assert.strictEqual(unique.size, ids.length, "all audit_record_ids must be unique")
    } finally {
      try { fs.unlinkSync(file) } catch (_) {}
    }
  })
})

// ---------------------------------------------------------------------------
// AUDIT-EXPORT-GENERATED: exportRecords artifact
// ---------------------------------------------------------------------------
describe("AUDIT-EXPORT-GENERATED: exportRecords", () => {
  test("export produces a valid JSON artifact with record_count and records array", () => {
    const srcFile  = tmpAuditFile()
    const outFile  = tmpAuditFile()
    try {
      // Write 2 records (one allow, one deny)
      AuthzAudit.appendRecord(AuthzAudit.createRecord({
        correlation_id: "cid_exp-001",
        request_id: "rid_exp-001",
        route: "ops.execute", method: "POST",
        actor_id: "adm_ops", resolved_role: "ops",
        relevant_permission: "ops:execute",
        decision_type: AuthzAudit.DECISION_TYPES.OPS_EXECUTE,
        decision_outcome: AuthzAudit.OUTCOMES.ALLOW,
        status_code: 200, reason_code: "permission_granted",
      }), srcFile)

      AuthzAudit.appendRecord(AuthzAudit.createRecord({
        correlation_id: "cid_exp-002",
        request_id: "rid_exp-002",
        route: "ops.override", method: "POST",
        actor_id: "adm_ops", resolved_role: "ops",
        relevant_permission: "ops:override",
        decision_type: AuthzAudit.DECISION_TYPES.OPS_OVERRIDE,
        decision_outcome: AuthzAudit.OUTCOMES.DENY,
        status_code: 403, reason_code: "missing_permission:ops:override",
      }), srcFile)

      const artifact = AuthzAudit.exportRecords(outFile, srcFile)

      assert.strictEqual(artifact.record_count, 2)
      assert.ok(Array.isArray(artifact.records), "records must be an array")
      assert.strictEqual(artifact.records.length, 2)
      assert.ok(artifact.exported_at, "exported_at must be present")
      assert.strictEqual(artifact.evidence_version, AuthzAudit.AUDIT_VERSION)

      // Verify output file written
      const raw = fs.readFileSync(outFile, "utf8")
      const parsed = JSON.parse(raw)
      assert.strictEqual(parsed.record_count, 2)

      // Verify both allow and deny present
      const outcomes = new Set(artifact.records.map(r => r.decision_outcome))
      assert.ok(outcomes.has("allow"), "export must include allow record")
      assert.ok(outcomes.has("deny"),  "export must include deny record")

      // Verify source JSONL unchanged after export
      assert.strictEqual(AuthzAudit.countRecords(srcFile), 2, "export must not mutate source JSONL")
    } finally {
      try { fs.unlinkSync(srcFile) } catch (_) {}
      try { fs.unlinkSync(outFile) } catch (_) {}
    }
  })
})

// ---------------------------------------------------------------------------
// Integration: AdminPerms + AuthzAudit — decision record for real permissions
// ---------------------------------------------------------------------------
describe("Integration: Phase 11 + Phase 12 — checkPerm feeds audit record", () => {
  test("allow decision from checkPerm maps correctly to audit record fields", () => {
    const principal = { id: "adm_ops_int", role: "ops", status: "active" }
    const decision = AdminPerms.checkPerm(principal, AdminPerms.PERMS.OPS_EXECUTE)
    assert.strictEqual(decision.allowed, true)
    assert.strictEqual(decision.decision, "allow")

    const rec = AuthzAudit.createRecord({
      correlation_id: AuthzAudit.generateCorrelationId(),
      request_id:     AuthzAudit.generateRequestId(),
      route: "ops.execute", method: "POST",
      actor_id:            decision.actor,
      resolved_role:       decision.role,
      relevant_permission: AdminPerms.PERMS.OPS_EXECUTE,
      decision_type:       AuthzAudit.DECISION_TYPES.OPS_EXECUTE,
      decision_outcome:    decision.allowed ? AuthzAudit.OUTCOMES.ALLOW : AuthzAudit.OUTCOMES.DENY,
      status_code:         200,
      reason_code:         "permission_granted",
    })

    assert.strictEqual(rec.actor_id,         "adm_ops_int")
    assert.strictEqual(rec.resolved_role,    "ops")
    assert.strictEqual(rec.decision_outcome, "allow")
  })

  test("deny decision from checkPerm maps correctly to audit record fields", () => {
    const principal = { id: "adm_ops_int2", role: "ops", status: "active" }
    const decision = AdminPerms.checkPerm(principal, AdminPerms.PERMS.OPS_OVERRIDE)
    assert.strictEqual(decision.allowed, false)
    assert.strictEqual(decision.decision, "deny")

    const rec = AuthzAudit.createRecord({
      correlation_id: AuthzAudit.generateCorrelationId(),
      request_id:     AuthzAudit.generateRequestId(),
      route: "ops.override", method: "POST",
      actor_id:            decision.actor,
      resolved_role:       decision.role,
      relevant_permission: AdminPerms.PERMS.OPS_OVERRIDE,
      decision_type:       AuthzAudit.DECISION_TYPES.OPS_OVERRIDE,
      decision_outcome:    decision.allowed ? AuthzAudit.OUTCOMES.ALLOW : AuthzAudit.OUTCOMES.DENY,
      status_code:         403,
      reason_code:         `missing_permission:${AdminPerms.PERMS.OPS_OVERRIDE}`,
    })

    assert.strictEqual(rec.actor_id,         "adm_ops_int2")
    assert.strictEqual(rec.resolved_role,    "ops")
    assert.strictEqual(rec.decision_outcome, "deny")
    assert.strictEqual(rec.status_code,      403)
  })
})
