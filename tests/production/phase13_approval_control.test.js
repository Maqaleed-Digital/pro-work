"use strict"

/**
 * PROWORK PHASE 13 — Approval-Bound Privileged Operations Unit Tests
 *
 * Covers:
 * - APPROVAL_ACTIONS catalog completeness
 * - createApprovalRequest: valid and invalid role
 * - createApprovalDecision: maker-checker enforcement
 * - createApprovalDecision: approver role validation
 * - validateApproval: missing request, no decision, consumed (replay)
 * - consumeApproval: marks consumed, replay denied
 * - exportApprovals: artifact structure
 * - appendApprovalRequest / appendApprovalDecision: append-only writes
 * - OUTCOMES constants
 */

const { test, describe } = require("node:test")
const assert  = require("node:assert")
const fs      = require("fs")
const os      = require("os")
const path    = require("path")
const crypto  = require("crypto")

const ApprovalControl = require("../../app/lib/approval_control")
const {
  APPROVAL_ACTIONS,
  OUTCOMES,
  MAKER_CHECKER_ACTIONS,
  REQUESTER_ROLES,
  APPROVER_ROLES,
  createApprovalRequest,
  createApprovalDecision,
  validateApproval,
  consumeApproval,
  appendApprovalRequest,
  appendApprovalDecision,
  readApprovalRequests,
  readApprovalDecisions,
  exportApprovals,
} = ApprovalControl

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function tmpFile(ext) {
  return path.join(os.tmpdir(), `prowork_apr_test_${crypto.randomUUID()}${ext || ".jsonl"}`)
}

// Build an isolated approval environment (own JSONL files + fresh in-memory state)
// We call createApprovalRequest / createApprovalDecision which use the module-level
// in-memory state. To isolate tests, we pass custom file paths and check file contents.

function makeRequest(overrides) {
  return createApprovalRequest({
    correlation_id:     "cid_test",
    request_id:         "rid_test",
    requester_actor_id: "adm_ops_001",
    requester_role:     "ops",
    action_type:        APPROVAL_ACTIONS.OPS_FORCE_EXECUTE,
    target_route:       "ops.force_execute",
    reason:             "test",
    ...overrides,
  })
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
describe("ApprovalControl: constants", () => {
  test("APPROVAL_ACTIONS has ops.override, ops.force_execute, admin.config_change", () => {
    assert.strictEqual(APPROVAL_ACTIONS.OPS_OVERRIDE,        "ops.override")
    assert.strictEqual(APPROVAL_ACTIONS.OPS_FORCE_EXECUTE,   "ops.force_execute")
    assert.strictEqual(APPROVAL_ACTIONS.ADMIN_CONFIG_CHANGE, "admin.config_change")
  })

  test("OUTCOMES has pending, approved, denied, revoked, consumed, expired", () => {
    const required = ["PENDING", "APPROVED", "DENIED", "REVOKED", "CONSUMED", "EXPIRED"]
    for (const k of required) {
      assert.ok(OUTCOMES[k], `OUTCOMES.${k} missing`)
    }
  })

  test("MAKER_CHECKER_ACTIONS includes ops.override and admin.config_change", () => {
    assert.ok(MAKER_CHECKER_ACTIONS.has(APPROVAL_ACTIONS.OPS_OVERRIDE))
    assert.ok(MAKER_CHECKER_ACTIONS.has(APPROVAL_ACTIONS.ADMIN_CONFIG_CHANGE))
  })

  test("ops.force_execute is NOT in MAKER_CHECKER_ACTIONS", () => {
    assert.ok(!MAKER_CHECKER_ACTIONS.has(APPROVAL_ACTIONS.OPS_FORCE_EXECUTE))
  })

  test("REQUESTER_ROLES: ops can request ops.override", () => {
    assert.ok(REQUESTER_ROLES[APPROVAL_ACTIONS.OPS_OVERRIDE].has("ops"))
  })

  test("REQUESTER_ROLES: auditor cannot request any privileged action", () => {
    for (const action of Object.values(APPROVAL_ACTIONS)) {
      const roles = REQUESTER_ROLES[action] || new Set()
      assert.ok(!roles.has("auditor"), `auditor should not be able to request ${action}`)
    }
  })

  test("APPROVER_ROLES: only superadmin can approve ops.override", () => {
    const roles = APPROVER_ROLES[APPROVAL_ACTIONS.OPS_OVERRIDE]
    assert.ok(roles.has("superadmin"))
    assert.ok(!roles.has("ops"))
    assert.ok(!roles.has("auditor"))
  })
})

// ---------------------------------------------------------------------------
// APPROVAL-REQUEST-CREATED
// ---------------------------------------------------------------------------
describe("APPROVAL-REQUEST-CREATED: createApprovalRequest", () => {
  test("creates valid request for ops requesting ops.force_execute", () => {
    const result = makeRequest()
    assert.strictEqual(result.ok, true)
    const rec = result.data
    assert.ok(rec.approval_request_id.startsWith("apr_"))
    assert.strictEqual(rec.action_type, APPROVAL_ACTIONS.OPS_FORCE_EXECUTE)
    assert.strictEqual(rec.requester_role, "ops")
    assert.strictEqual(rec.status, OUTCOMES.PENDING)
    assert.strictEqual(rec.evidence_version, ApprovalControl.APPROVAL_VERSION)
  })

  test("all required fields present in request record", () => {
    const result = makeRequest()
    const required = [
      "approval_request_id", "timestamp", "correlation_id", "request_id",
      "requester_actor_id", "requester_role", "action_type", "target_route",
      "reason", "status", "evidence_version"
    ]
    for (const f of required) {
      assert.ok(Object.prototype.hasOwnProperty.call(result.data, f), `missing field: ${f}`)
    }
  })

  test("APPROVAL-REQUEST-DENIED-WITHOUT-PRIVILEGE: auditor cannot request approval", () => {
    const result = createApprovalRequest({
      correlation_id: "cid_t", request_id: "rid_t",
      requester_actor_id: "adm_auditor", requester_role: "auditor",
      action_type: APPROVAL_ACTIONS.OPS_OVERRIDE,
      target_route: "ops.override", reason: "test",
    })
    assert.strictEqual(result.ok, false)
    assert.strictEqual(result.error.code, "FORBIDDEN")
  })

  test("unknown action type is rejected", () => {
    const result = createApprovalRequest({
      correlation_id: "cid_t", request_id: "rid_t",
      requester_actor_id: "adm_sa", requester_role: "superadmin",
      action_type: "nonexistent.action",
      target_route: "test", reason: "test",
    })
    assert.strictEqual(result.ok, false)
    assert.strictEqual(result.error.code, "UNKNOWN_ACTION")
  })
})

// ---------------------------------------------------------------------------
// APPROVAL-DECISION-APPROVED / APPROVAL-DECISION-DENIED
// ---------------------------------------------------------------------------
describe("APPROVAL-DECISION-APPROVED / APPROVAL-DECISION-DENIED: createApprovalDecision", () => {
  test("APPROVAL-DECISION-APPROVED: superadmin can approve ops.override for different requester", () => {
    // First create a request
    const req = makeRequest({
      requester_actor_id: "adm_ops_requester",
      requester_role: "ops",
      action_type: APPROVAL_ACTIONS.OPS_OVERRIDE,
    })
    assert.strictEqual(req.ok, true)
    appendApprovalRequest(req.data, tmpFile())  // persist to tmp (not real file)
    // Store in module state (already done by createApprovalRequest→in-memory path via appendApprovalRequest)

    const dec = createApprovalDecision({
      approval_request_id: req.data.approval_request_id,
      approver_actor_id:   "adm_sa_approver",
      approver_role:       "superadmin",
      decision_outcome:    OUTCOMES.APPROVED,
      decision_reason:     "approved by test",
    })
    assert.strictEqual(dec.ok, true)
    const drec = dec.data
    assert.ok(drec.approval_decision_id.startsWith("apd_"))
    assert.strictEqual(drec.decision_outcome, OUTCOMES.APPROVED)
    assert.strictEqual(drec.maker_checker_valid, true)
    assert.strictEqual(drec.evidence_version, ApprovalControl.APPROVAL_VERSION)
  })

  test("APPROVAL-DECISION-DENIED: decision record with denied outcome", () => {
    const req = makeRequest({
      requester_actor_id: "adm_ops_r2",
      requester_role: "ops",
      action_type: APPROVAL_ACTIONS.OPS_FORCE_EXECUTE,
    })
    appendApprovalRequest(req.data, tmpFile())
    const dec = createApprovalDecision({
      approval_request_id: req.data.approval_request_id,
      approver_actor_id:   "adm_ops_approver",
      approver_role:       "ops",
      decision_outcome:    OUTCOMES.DENIED,
      decision_reason:     "not authorized",
    })
    assert.strictEqual(dec.ok, true)
    assert.strictEqual(dec.data.decision_outcome, OUTCOMES.DENIED)
  })

  test("wrong approver role is rejected", () => {
    const req = makeRequest({
      requester_actor_id: "adm_ops_r3",
      requester_role: "ops",
      action_type: APPROVAL_ACTIONS.OPS_OVERRIDE,
    })
    appendApprovalRequest(req.data, tmpFile())
    const dec = createApprovalDecision({
      approval_request_id: req.data.approval_request_id,
      approver_actor_id:   "adm_ops_approver2",
      approver_role:       "ops",  // ops cannot approve override
      decision_outcome:    OUTCOMES.APPROVED,
      decision_reason:     "test",
    })
    assert.strictEqual(dec.ok, false)
    assert.strictEqual(dec.error.code, "FORBIDDEN")
  })
})

// ---------------------------------------------------------------------------
// APPROVAL-OVERRIDE-DENY-SELF-APPROVAL: maker-checker enforcement
// ---------------------------------------------------------------------------
describe("Maker-checker enforcement", () => {
  test("APPROVAL-OVERRIDE-DENY-SELF-APPROVAL: same actor cannot approve own override request", () => {
    const req = makeRequest({
      requester_actor_id: "adm_sa_self",
      requester_role: "superadmin",
      action_type: APPROVAL_ACTIONS.OPS_OVERRIDE,
    })
    appendApprovalRequest(req.data, tmpFile())
    const dec = createApprovalDecision({
      approval_request_id: req.data.approval_request_id,
      approver_actor_id:   "adm_sa_self",  // same actor
      approver_role:       "superadmin",
      decision_outcome:    OUTCOMES.APPROVED,
      decision_reason:     "self approve attempt",
    })
    assert.strictEqual(dec.ok, false)
    assert.strictEqual(dec.error.code, "MAKER_CHECKER_VIOLATION")
  })

  test("ops.force_execute does NOT enforce maker-checker (same actor can approve)", () => {
    const req = makeRequest({
      requester_actor_id: "adm_ops_self",
      requester_role: "ops",
      action_type: APPROVAL_ACTIONS.OPS_FORCE_EXECUTE,
    })
    appendApprovalRequest(req.data, tmpFile())
    const dec = createApprovalDecision({
      approval_request_id: req.data.approval_request_id,
      approver_actor_id:   "adm_ops_self",  // same actor — allowed for non-maker-checker action
      approver_role:       "ops",
      decision_outcome:    OUTCOMES.APPROVED,
      decision_reason:     "ok",
    })
    // ops cannot approve ops.force_execute? Actually APPROVER_ROLES[ops.force_execute] = {superadmin, ops}
    // so ops CAN approve; and no maker-checker for this action
    assert.strictEqual(dec.ok, true)
    assert.strictEqual(dec.data.maker_checker_valid, null)  // not applicable
  })
})

// ---------------------------------------------------------------------------
// APPROVAL-OVERRIDE-DENY-NO-APPROVAL / validateApproval
// ---------------------------------------------------------------------------
describe("validateApproval", () => {
  test("APPROVAL-OVERRIDE-DENY-NO-APPROVAL: missing approval request returns not_found", () => {
    const result = validateApproval("apr_nonexistent", "adm_sa", APPROVAL_ACTIONS.OPS_OVERRIDE)
    assert.strictEqual(result.ok, false)
    assert.strictEqual(result.reason, "approval_request_not_found")
  })

  test("action type mismatch denied", () => {
    const req = makeRequest({
      requester_actor_id: "adm_ops_v1",
      action_type: APPROVAL_ACTIONS.OPS_FORCE_EXECUTE,
    })
    appendApprovalRequest(req.data, tmpFile())
    const result = validateApproval(req.data.approval_request_id, "adm_sa", APPROVAL_ACTIONS.OPS_OVERRIDE)
    assert.strictEqual(result.ok, false)
    assert.strictEqual(result.reason, "action_type_mismatch")
  })

  test("no decision present → denied", () => {
    const req = makeRequest({
      requester_actor_id: "adm_ops_v2",
      action_type: APPROVAL_ACTIONS.OPS_FORCE_EXECUTE,
    })
    appendApprovalRequest(req.data, tmpFile())
    // No decision appended
    const result = validateApproval(req.data.approval_request_id, "adm_sa", APPROVAL_ACTIONS.OPS_FORCE_EXECUTE)
    assert.strictEqual(result.ok, false)
    assert.strictEqual(result.reason, "no_approval_decision")
  })

  test("APPROVAL-OVERRIDE-ALLOW-WITH-APPROVAL: approved by different actor → valid", () => {
    const req = makeRequest({
      requester_actor_id: "adm_ops_v3",
      requester_role: "ops",
      action_type: APPROVAL_ACTIONS.OPS_FORCE_EXECUTE,
    })
    appendApprovalRequest(req.data, tmpFile())
    const dec = createApprovalDecision({
      approval_request_id: req.data.approval_request_id,
      approver_actor_id:   "adm_sa_v3",
      approver_role:       "superadmin",
      decision_outcome:    OUTCOMES.APPROVED,
      decision_reason:     "test",
    })
    appendApprovalDecision(dec.data, tmpFile())
    const result = validateApproval(req.data.approval_request_id, "adm_sa_v3", APPROVAL_ACTIONS.OPS_FORCE_EXECUTE)
    assert.strictEqual(result.ok, true)
    assert.strictEqual(result.reason, "approved")
    assert.ok(result.decision_record)
  })
})

// ---------------------------------------------------------------------------
// APPROVAL-REPLAY-DENIED: consumeApproval
// ---------------------------------------------------------------------------
describe("APPROVAL-REPLAY-DENIED: consumeApproval", () => {
  test("consuming approval marks it consumed and blocks replay", () => {
    const req = makeRequest({
      requester_actor_id: "adm_ops_replay",
      requester_role: "ops",
      action_type: APPROVAL_ACTIONS.OPS_FORCE_EXECUTE,
    })
    appendApprovalRequest(req.data, tmpFile())
    const dec = createApprovalDecision({
      approval_request_id: req.data.approval_request_id,
      approver_actor_id:   "adm_sa_replay",
      approver_role:       "superadmin",
      decision_outcome:    OUTCOMES.APPROVED,
      decision_reason:     "ok",
    })
    appendApprovalDecision(dec.data, tmpFile())

    // First execution should succeed
    const v1 = validateApproval(req.data.approval_request_id, "adm_sa_replay", APPROVAL_ACTIONS.OPS_FORCE_EXECUTE)
    assert.strictEqual(v1.ok, true)

    // Consume
    const consumed = consumeApproval(req.data.approval_request_id, "adm_sa_replay", tmpFile())
    assert.strictEqual(consumed.ok, true)
    assert.strictEqual(consumed.data.decision_outcome, OUTCOMES.CONSUMED)

    // Replay attempt should fail
    const v2 = validateApproval(req.data.approval_request_id, "adm_sa_replay", APPROVAL_ACTIONS.OPS_FORCE_EXECUTE)
    assert.strictEqual(v2.ok, false)
    assert.strictEqual(v2.reason, "approval_already_consumed")
  })
})

// ---------------------------------------------------------------------------
// Append-only JSONL storage
// ---------------------------------------------------------------------------
describe("Append-only JSONL storage", () => {
  test("appendApprovalRequest writes to JSONL and can be read back", () => {
    const rFile = tmpFile()
    try {
      const req = makeRequest({ requester_actor_id: "adm_write_test" })
      appendApprovalRequest(req.data, rFile)
      const records = readApprovalRequests(rFile)
      assert.strictEqual(records.length, 1)
      assert.strictEqual(records[0].requester_actor_id, "adm_write_test")
      assert.ok(records[0].approval_request_id.startsWith("apr_"))
    } finally {
      try { fs.unlinkSync(rFile) } catch (_) {}
    }
  })

  test("multiple requests produce multiple JSONL lines", () => {
    const rFile = tmpFile()
    try {
      for (let i = 0; i < 3; i++) {
        const req = makeRequest({ requester_actor_id: `adm_multi_${i}` })
        appendApprovalRequest(req.data, rFile)
      }
      const records = readApprovalRequests(rFile)
      assert.strictEqual(records.length, 3)
      const ids = new Set(records.map(r => r.approval_request_id))
      assert.strictEqual(ids.size, 3, "all approval_request_ids must be unique")
    } finally {
      try { fs.unlinkSync(rFile) } catch (_) {}
    }
  })

  test("appendApprovalDecision writes to decisions JSONL", () => {
    const rFile = tmpFile()
    const dFile = tmpFile()
    try {
      const req = makeRequest({ requester_actor_id: "adm_dec_test" })
      appendApprovalRequest(req.data, rFile)
      const dec = createApprovalDecision({
        approval_request_id: req.data.approval_request_id,
        approver_actor_id: "adm_sa_dec",
        approver_role: "superadmin",
        decision_outcome: OUTCOMES.APPROVED,
        decision_reason: "ok",
      })
      appendApprovalDecision(dec.data, dFile)
      const decisions = readApprovalDecisions(dFile)
      assert.strictEqual(decisions.length, 1)
      assert.strictEqual(decisions[0].decision_outcome, OUTCOMES.APPROVED)
    } finally {
      try { fs.unlinkSync(rFile) } catch (_) {}
      try { fs.unlinkSync(dFile) } catch (_) {}
    }
  })
})

// ---------------------------------------------------------------------------
// APPROVAL-EXPORT-GENERATED
// ---------------------------------------------------------------------------
describe("APPROVAL-EXPORT-GENERATED: exportApprovals", () => {
  test("export produces JSON artifact with requests_count, decisions_count, arrays", () => {
    const rFile   = tmpFile()
    const dFile   = tmpFile()
    const outFile = tmpFile(".json")
    try {
      const req = makeRequest({ requester_actor_id: "adm_export" })
      appendApprovalRequest(req.data, rFile)
      const dec = createApprovalDecision({
        approval_request_id: req.data.approval_request_id,
        approver_actor_id: "adm_sa_export",
        approver_role: "superadmin",
        decision_outcome: OUTCOMES.APPROVED,
        decision_reason: "ok",
      })
      appendApprovalDecision(dec.data, dFile)

      const artifact = exportApprovals(outFile, rFile, dFile)
      assert.strictEqual(artifact.requests_count,  1)
      assert.strictEqual(artifact.decisions_count, 1)
      assert.ok(Array.isArray(artifact.requests))
      assert.ok(Array.isArray(artifact.decisions))
      assert.ok(artifact.exported_at)
      assert.strictEqual(artifact.evidence_version, ApprovalControl.APPROVAL_VERSION)

      const raw = JSON.parse(require("fs").readFileSync(outFile, "utf8"))
      assert.strictEqual(raw.requests_count, 1)

      // Source JSONL unchanged
      assert.strictEqual(readApprovalRequests(rFile).length, 1)
    } finally {
      try { fs.unlinkSync(rFile)   } catch (_) {}
      try { fs.unlinkSync(dFile)   } catch (_) {}
      try { fs.unlinkSync(outFile) } catch (_) {}
    }
  })
})

// ---------------------------------------------------------------------------
// APPROVAL-AUDIT-BINDING-PRESENT: consumed record carries approval_request_id
// ---------------------------------------------------------------------------
describe("APPROVAL-AUDIT-BINDING-PRESENT", () => {
  test("consumed decision record carries approval_request_id and consumed_by fields", () => {
    const req = makeRequest({ requester_actor_id: "adm_binding", action_type: APPROVAL_ACTIONS.OPS_FORCE_EXECUTE })
    appendApprovalRequest(req.data, tmpFile())
    const dec = createApprovalDecision({
      approval_request_id: req.data.approval_request_id,
      approver_actor_id: "adm_sa_binding",
      approver_role: "superadmin",
      decision_outcome: OUTCOMES.APPROVED,
      decision_reason: "ok",
    })
    appendApprovalDecision(dec.data, tmpFile())

    const consumed = consumeApproval(req.data.approval_request_id, "adm_sa_binding", tmpFile())
    assert.strictEqual(consumed.ok, true)
    assert.strictEqual(consumed.data.approval_request_id, req.data.approval_request_id)
    assert.ok(consumed.data.consumed_at)
    assert.strictEqual(consumed.data.consumed_by, "adm_sa_binding")
    assert.strictEqual(consumed.data.decision_outcome, OUTCOMES.CONSUMED)
  })
})
