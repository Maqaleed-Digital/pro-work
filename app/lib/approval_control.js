"use strict"

/**
 * PROWORK PHASE 13 — Approval-Bound Privileged Operations
 *
 * Append-only approval request and decision records for high-risk actions.
 * Implements maker-checker enforcement and one-time consumption replay protection.
 *
 * Storage:
 *   app/data/approval_requests.jsonl  — one request record per line
 *   app/data/approval_decisions.jsonl — one decision/event record per line
 *
 * In-memory state is authoritative for the current server process.
 * JSONL files provide append-only audit evidence.
 *
 * Rules:
 * - appendApprovalRequest() and appendApprovalDecision() are the only write paths
 * - maker-checker actions deny self-approval
 * - consumed approvals cannot be replayed
 * - missing approval for a configured action → deny
 * - invalid/revoked/expired approval → deny
 */

const fs     = require("fs")
const path   = require("path")
const crypto = require("crypto")

// ---------------------------------------------------------------------------
// Schema version
// ---------------------------------------------------------------------------
const APPROVAL_VERSION = "1.0"

// ---------------------------------------------------------------------------
// Approval-required action catalog
// ---------------------------------------------------------------------------
const APPROVAL_ACTIONS = Object.freeze({
  OPS_OVERRIDE:        "ops.override",
  OPS_FORCE_EXECUTE:   "ops.force_execute",
  ADMIN_CONFIG_CHANGE: "admin.config_change",
})

// Actions that require maker-checker (requester != approver)
const MAKER_CHECKER_ACTIONS = new Set([
  APPROVAL_ACTIONS.OPS_OVERRIDE,
  APPROVAL_ACTIONS.ADMIN_CONFIG_CHANGE,
])

// Roles permitted to request approval for each action
const REQUESTER_ROLES = Object.freeze({
  [APPROVAL_ACTIONS.OPS_OVERRIDE]:        new Set(["superadmin", "ops"]),
  [APPROVAL_ACTIONS.OPS_FORCE_EXECUTE]:   new Set(["superadmin", "ops"]),
  [APPROVAL_ACTIONS.ADMIN_CONFIG_CHANGE]: new Set(["superadmin"]),
})

// Roles permitted to approve each action
const APPROVER_ROLES = Object.freeze({
  [APPROVAL_ACTIONS.OPS_OVERRIDE]:        new Set(["superadmin"]),
  [APPROVAL_ACTIONS.OPS_FORCE_EXECUTE]:   new Set(["superadmin", "ops"]),
  [APPROVAL_ACTIONS.ADMIN_CONFIG_CHANGE]: new Set(["superadmin"]),
})

// ---------------------------------------------------------------------------
// Decision outcomes
// ---------------------------------------------------------------------------
const OUTCOMES = Object.freeze({
  PENDING:  "pending",
  APPROVED: "approved",
  DENIED:   "denied",
  REVOKED:  "revoked",
  CONSUMED: "consumed",
  EXPIRED:  "expired",
})

// ---------------------------------------------------------------------------
// ID generators
// ---------------------------------------------------------------------------
function generateApprovalRequestId() { return `apr_${crypto.randomUUID()}` }
function generateApprovalDecisionId() { return `apd_${crypto.randomUUID()}` }

// ---------------------------------------------------------------------------
// Default storage paths
// ---------------------------------------------------------------------------
function defaultRequestsFile()  { return path.join(__dirname, "..", "data", "approval_requests.jsonl") }
function defaultDecisionsFile() { return path.join(__dirname, "..", "data", "approval_decisions.jsonl") }

// ---------------------------------------------------------------------------
// In-memory state (authoritative for current process)
// approval_request_id → request record
const _requests  = new Map()
// approval_request_id → latest decision record
const _decisions = new Map()
// approval_request_ids that have been consumed (replay-denied)
const _consumed  = new Set()

// ---------------------------------------------------------------------------
// State initializer — call once at server startup to hydrate from JSONL files
// ---------------------------------------------------------------------------
function loadState(requestsFile, decisionsFile) {
  const rFile = requestsFile || defaultRequestsFile()
  const dFile = decisionsFile || defaultDecisionsFile()

  // Load requests
  try {
    if (fs.existsSync(rFile)) {
      const lines = fs.readFileSync(rFile, "utf8").trim().split("\n").filter(Boolean)
      for (const line of lines) {
        try {
          const r = JSON.parse(line)
          _requests.set(r.approval_request_id, r)
        } catch (_) {}
      }
    }
  } catch (_) {}

  // Load decisions — replay events to reconstruct state
  try {
    if (fs.existsSync(dFile)) {
      const lines = fs.readFileSync(dFile, "utf8").trim().split("\n").filter(Boolean)
      for (const line of lines) {
        try {
          const d = JSON.parse(line)
          // Always overwrite with latest event for this request
          _decisions.set(d.approval_request_id, d)
          if (d.decision_outcome === OUTCOMES.CONSUMED) {
            _consumed.add(d.approval_request_id)
          }
        } catch (_) {}
      }
    }
  } catch (_) {}
}

// ---------------------------------------------------------------------------
// Approval request record factory
// ---------------------------------------------------------------------------
function createApprovalRequest({
  correlation_id,
  request_id,
  requester_actor_id,
  requester_role,
  action_type,
  target_route,
  reason,
}) {
  const knownActions = new Set(Object.values(APPROVAL_ACTIONS))
  if (!knownActions.has(String(action_type || ""))) {
    return { ok: false, error: { code: "UNKNOWN_ACTION", message: `unknown approval action: ${action_type}` } }
  }
  const allowedRequesters = REQUESTER_ROLES[action_type] || new Set()
  if (!allowedRequesters.has(String(requester_role || ""))) {
    return { ok: false, error: { code: "FORBIDDEN", message: `role "${requester_role}" cannot request approval for ${action_type}` } }
  }
  const record = Object.freeze({
    approval_request_id: generateApprovalRequestId(),
    timestamp:           new Date().toISOString(),
    correlation_id:      String(correlation_id     || `cid_${crypto.randomUUID()}`),
    request_id:          String(request_id         || `rid_${crypto.randomUUID()}`),
    requester_actor_id:  String(requester_actor_id || "(unknown)"),
    requester_role:      String(requester_role      || "(unknown)"),
    action_type:         String(action_type),
    target_route:        String(target_route        || "(unknown)"),
    reason:              String(reason              || ""),
    status:              OUTCOMES.PENDING,
    evidence_version:    APPROVAL_VERSION,
  })
  return { ok: true, data: record }
}

// ---------------------------------------------------------------------------
// appendApprovalRequest — append-only write path for requests
// ---------------------------------------------------------------------------
function appendApprovalRequest(record, requestsFile) {
  const target = requestsFile || defaultRequestsFile()
  fs.appendFileSync(target, JSON.stringify(record) + "\n", "utf8")
  _requests.set(record.approval_request_id, record)
  return record
}

// ---------------------------------------------------------------------------
// Approval decision record factory
// ---------------------------------------------------------------------------
function createApprovalDecision({
  approval_request_id,
  approver_actor_id,
  approver_role,
  decision_outcome,
  decision_reason,
}) {
  if (!_requests.has(String(approval_request_id || ""))) {
    return { ok: false, error: { code: "NOT_FOUND", message: `approval request not found: ${approval_request_id}` } }
  }
  const req = _requests.get(String(approval_request_id))

  // Validate approver role
  const allowedApprovers = APPROVER_ROLES[req.action_type] || new Set()
  if (!allowedApprovers.has(String(approver_role || ""))) {
    return { ok: false, error: { code: "FORBIDDEN", message: `role "${approver_role}" cannot approve ${req.action_type}` } }
  }

  // Maker-checker: approver cannot be the requester
  if (MAKER_CHECKER_ACTIONS.has(req.action_type)) {
    if (String(approver_actor_id) === String(req.requester_actor_id)) {
      return { ok: false, error: { code: "MAKER_CHECKER_VIOLATION", message: "approver cannot be the same actor as the requester" } }
    }
  }

  // Check current status — only pending requests can be decided
  const existing = _decisions.get(String(approval_request_id))
  if (existing && existing.decision_outcome !== OUTCOMES.PENDING) {
    return { ok: false, error: { code: "ALREADY_DECIDED", message: `approval already has outcome: ${existing.decision_outcome}` } }
  }
  if (_consumed.has(String(approval_request_id))) {
    return { ok: false, error: { code: "ALREADY_CONSUMED", message: "approval already consumed" } }
  }

  const record = Object.freeze({
    approval_decision_id:  generateApprovalDecisionId(),
    timestamp:             new Date().toISOString(),
    approval_request_id:   String(approval_request_id),
    approver_actor_id:     String(approver_actor_id  || "(unknown)"),
    approver_role:         String(approver_role       || "(unknown)"),
    decision_outcome:      String(decision_outcome    || OUTCOMES.DENIED),
    decision_reason:       String(decision_reason     || ""),
    maker_checker_valid:   MAKER_CHECKER_ACTIONS.has(req.action_type)
                            ? String(approver_actor_id) !== String(req.requester_actor_id)
                            : null,
    expires_at:            null,
    consumed_at:           null,
    revoked_at:            null,
    evidence_version:      APPROVAL_VERSION,
  })
  return { ok: true, data: record }
}

// ---------------------------------------------------------------------------
// appendApprovalDecision — append-only write path for decisions
// ---------------------------------------------------------------------------
function appendApprovalDecision(record, decisionsFile) {
  const target = decisionsFile || defaultDecisionsFile()
  fs.appendFileSync(target, JSON.stringify(record) + "\n", "utf8")
  _decisions.set(record.approval_request_id, record)
  return record
}

// ---------------------------------------------------------------------------
// validateApproval — check approval state before execution
// Returns { ok, decision_record, reason }
// ---------------------------------------------------------------------------
function validateApproval(approvalRequestId, executingActorId, actionType) {
  const reqId = String(approvalRequestId || "")

  // Request must exist
  if (!_requests.has(reqId)) {
    return { ok: false, reason: "approval_request_not_found" }
  }
  const req = _requests.get(reqId)

  // Action type must match
  if (req.action_type !== String(actionType || "")) {
    return { ok: false, reason: "action_type_mismatch" }
  }

  // Must not be consumed (replay protection)
  if (_consumed.has(reqId)) {
    return { ok: false, reason: "approval_already_consumed" }
  }

  // Must have an approved decision
  const dec = _decisions.get(reqId)
  if (!dec) {
    return { ok: false, reason: "no_approval_decision" }
  }
  if (dec.decision_outcome !== OUTCOMES.APPROVED) {
    return { ok: false, reason: `approval_outcome_is_${dec.decision_outcome}` }
  }

  // Maker-checker: executor must not be the same as requester
  if (MAKER_CHECKER_ACTIONS.has(req.action_type)) {
    if (String(executingActorId) === String(req.requester_actor_id)) {
      return { ok: false, reason: "maker_checker_violation_executor_is_requester" }
    }
  }

  return { ok: true, decision_record: dec, request_record: req, reason: "approved" }
}

// ---------------------------------------------------------------------------
// consumeApproval — mark approval as consumed (replay-safe one-time execution)
// Appends a consumed event to decisions JSONL.
// ---------------------------------------------------------------------------
function consumeApproval(approvalRequestId, executingActorId, decisionsFile) {
  const reqId = String(approvalRequestId || "")
  const dec   = _decisions.get(reqId)
  if (!dec) return { ok: false, reason: "decision_not_found" }

  const consumed = Object.freeze({
    ...dec,
    approval_decision_id: generateApprovalDecisionId(),  // new event record ID
    decision_outcome:     OUTCOMES.CONSUMED,
    consumed_at:          new Date().toISOString(),
    consumed_by:          String(executingActorId || "(unknown)"),
    evidence_version:     APPROVAL_VERSION,
  })
  const target = decisionsFile || defaultDecisionsFile()
  fs.appendFileSync(target, JSON.stringify(consumed) + "\n", "utf8")
  _decisions.set(reqId, consumed)
  _consumed.add(reqId)
  return { ok: true, data: consumed }
}

// ---------------------------------------------------------------------------
// readApprovalRequests / readApprovalDecisions — read-only views
// ---------------------------------------------------------------------------
function readApprovalRequests(requestsFile) {
  const target = requestsFile || defaultRequestsFile()
  try {
    const raw = fs.readFileSync(target, "utf8")
    return raw.trim().split("\n").filter(Boolean).map(l => JSON.parse(l))
  } catch (_) { return [] }
}

function readApprovalDecisions(decisionsFile) {
  const target = decisionsFile || defaultDecisionsFile()
  try {
    const raw = fs.readFileSync(target, "utf8")
    return raw.trim().split("\n").filter(Boolean).map(l => JSON.parse(l))
  } catch (_) { return [] }
}

// ---------------------------------------------------------------------------
// exportApprovals — generate JSON artifact (does not mutate source JSONL)
// ---------------------------------------------------------------------------
function exportApprovals(outputPath, requestsFile, decisionsFile) {
  const requests  = readApprovalRequests(requestsFile)
  const decisions = readApprovalDecisions(decisionsFile)
  const artifact  = {
    exported_at:      new Date().toISOString(),
    evidence_version: APPROVAL_VERSION,
    requests_count:   requests.length,
    decisions_count:  decisions.length,
    requests,
    decisions,
  }
  fs.writeFileSync(outputPath, JSON.stringify(artifact, null, 2) + "\n", "utf8")
  return artifact
}

// ---------------------------------------------------------------------------
// getRequestById — lookup helper for handlers
// ---------------------------------------------------------------------------
function getRequestById(approvalRequestId) {
  return _requests.get(String(approvalRequestId || "")) || null
}

// ---------------------------------------------------------------------------
// getDecisionByRequestId — lookup helper for handlers
// ---------------------------------------------------------------------------
function getDecisionByRequestId(approvalRequestId) {
  return _decisions.get(String(approvalRequestId || "")) || null
}

module.exports = {
  APPROVAL_VERSION,
  APPROVAL_ACTIONS,
  MAKER_CHECKER_ACTIONS,
  REQUESTER_ROLES,
  APPROVER_ROLES,
  OUTCOMES,
  generateApprovalRequestId,
  generateApprovalDecisionId,
  defaultRequestsFile,
  defaultDecisionsFile,
  loadState,
  createApprovalRequest,
  appendApprovalRequest,
  createApprovalDecision,
  appendApprovalDecision,
  validateApproval,
  consumeApproval,
  readApprovalRequests,
  readApprovalDecisions,
  exportApprovals,
  getRequestById,
  getDecisionByRequestId,
}
