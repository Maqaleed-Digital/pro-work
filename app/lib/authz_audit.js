"use strict"

/**
 * PROWORK PHASE 12 — Authorization Audit (Append-Only)
 *
 * Append-only JSONL audit writer for privileged authorization decisions.
 * Each record is a self-contained immutable evidence entry.
 *
 * Storage: app/data/authz_audit.jsonl (one JSON record per line)
 * Export:  exportRecords() produces a JSON artifact for review.
 *
 * Rules:
 * - appendRecord() is the only write path — no in-place mutation
 * - readRecords() is purely additive (read-only view)
 * - exportRecords() writes a snapshot artifact, does not alter the JSONL
 * - correlation_id and request_id are mandatory on every privileged record;
 *   generated internally if not supplied by the caller
 */

const fs     = require("fs")
const path   = require("path")
const crypto = require("crypto")

// ---------------------------------------------------------------------------
// Schema constants
// ---------------------------------------------------------------------------
const AUDIT_VERSION    = "1.0"
const SOURCE_COMPONENT = "prowork.authz"

const DECISION_TYPES = Object.freeze({
  ADMIN_READ:   "admin.read",
  OPS_READ:     "ops.read",
  OPS_EXECUTE:  "ops.execute",
  OPS_RETRY:    "ops.retry",
  OPS_OVERRIDE: "ops.override",
  PERM_ALLOWED: "permission.allowed",
  PERM_DENIED:  "permission.denied",
  PERM_MISSING: "permission.mapping.missing",
})

const OUTCOMES = Object.freeze({
  ALLOW: "allow",
  DENY:  "deny",
})

// ---------------------------------------------------------------------------
// ID generators
// ---------------------------------------------------------------------------
function generateAuditId()       { return `aud_${crypto.randomUUID()}` }
function generateCorrelationId() { return `cid_${crypto.randomUUID()}` }
function generateRequestId()     { return `rid_${crypto.randomUUID()}` }

// ---------------------------------------------------------------------------
// Default storage path
// ---------------------------------------------------------------------------
function defaultAuditFile() {
  return path.join(__dirname, "..", "data", "authz_audit.jsonl")
}

// ---------------------------------------------------------------------------
// createRecord — canonical schema factory
// ---------------------------------------------------------------------------
function createRecord({
  correlation_id,
  request_id,
  route,
  method,
  actor_id,
  resolved_role,
  relevant_permission,
  decision_type,
  decision_outcome,
  status_code,
  reason_code,
}) {
  return Object.freeze({
    audit_record_id:     generateAuditId(),
    timestamp:           new Date().toISOString(),
    correlation_id:      String(correlation_id  || generateCorrelationId()),
    request_id:          String(request_id       || generateRequestId()),
    route:               String(route            || "(unknown)"),
    method:              String(method           || "(unknown)"),
    actor_id:            String(actor_id         || "(unknown)"),
    resolved_role:       String(resolved_role    || "(unknown)"),
    relevant_permission: String(relevant_permission || "(unknown)"),
    decision_type:       String(decision_type    || DECISION_TYPES.PERM_DENIED),
    decision_outcome:    String(decision_outcome || OUTCOMES.DENY),
    status_code:         Number(status_code      || 0),
    reason_code:         String(reason_code      || ""),
    source_component:    SOURCE_COMPONENT,
    evidence_version:    AUDIT_VERSION,
  })
}

// ---------------------------------------------------------------------------
// appendRecord — the ONLY write path (append-only)
// ---------------------------------------------------------------------------
function appendRecord(record, filePath) {
  const target = filePath || defaultAuditFile()
  const line   = JSON.stringify(record) + "\n"
  fs.appendFileSync(target, line, "utf8")
  return record
}

// ---------------------------------------------------------------------------
// readRecords — parse JSONL → array of records (read-only)
// ---------------------------------------------------------------------------
function readRecords(filePath) {
  const target = filePath || defaultAuditFile()
  try {
    const raw = fs.readFileSync(target, "utf8")
    return raw
      .trim()
      .split("\n")
      .filter(Boolean)
      .map(line => JSON.parse(line))
  } catch (_) {
    return []
  }
}

// ---------------------------------------------------------------------------
// exportRecords — write JSON array snapshot artifact
// Does NOT alter the source JSONL file.
// ---------------------------------------------------------------------------
function exportRecords(outputPath, filePath) {
  const records  = readRecords(filePath)
  const artifact = {
    exported_at:      new Date().toISOString(),
    record_count:     records.length,
    evidence_version: AUDIT_VERSION,
    source_component: SOURCE_COMPONENT,
    records,
  }
  fs.writeFileSync(outputPath, JSON.stringify(artifact, null, 2) + "\n", "utf8")
  return artifact
}

// ---------------------------------------------------------------------------
// countRecords — helper for append-only verification
// ---------------------------------------------------------------------------
function countRecords(filePath) {
  return readRecords(filePath).length
}

module.exports = {
  AUDIT_VERSION,
  DECISION_TYPES,
  OUTCOMES,
  generateAuditId,
  generateCorrelationId,
  generateRequestId,
  defaultAuditFile,
  createRecord,
  appendRecord,
  readRecords,
  exportRecords,
  countRecords,
}
