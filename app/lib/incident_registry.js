"use strict"

/**
 * PROWORK PHASE 19 — Breach Response + Incident Containment Governance
 *
 * Provides:
 * - Incident severity catalog (low, medium, high, critical)
 * - Incident status catalog (active, contained, resolved)
 * - In-memory incident registry
 * - Containment policy: critical → block privileged execution;
 *   high → restrict sensitive routes
 * - declareIncident(): register a new active incident
 * - containIncident(): transition to contained (controls applied but not resolved)
 * - resolveIncident(): transition to resolved
 * - getActiveIncidents(): all active/contained incidents
 * - hasActiveIncidentAtOrAbove(severity): containment check for server guards
 * - getGovernanceState(): read-only snapshot
 * - exportGovernance(): machine-readable artifact (no state mutation)
 *
 * Severity order: low(1) < medium(2) < high(3) < critical(4)
 *
 * Containment rules:
 * - critical or above → block all governed privileged execution
 * - high or above     → restrict sensitive governed routes
 * - resolved incident → no longer enforced
 * - unknown severity  → fail closed
 */

const fs     = require("fs")
const crypto = require("crypto")

// ---------------------------------------------------------------------------
// Schema version
// ---------------------------------------------------------------------------
const INCIDENT_GOVERNANCE_VERSION = "1.0"

// ---------------------------------------------------------------------------
// Severity catalog — ordered by impact
// ---------------------------------------------------------------------------
const INCIDENT_SEVERITIES = Object.freeze({
  LOW:      "low",
  MEDIUM:   "medium",
  HIGH:     "high",
  CRITICAL: "critical",
})

const _SEVERITY_RANK = Object.freeze({
  low:      1,
  medium:   2,
  high:     3,
  critical: 4,
})

const _KNOWN_SEVERITIES = new Set(Object.values(INCIDENT_SEVERITIES))

// ---------------------------------------------------------------------------
// Status catalog
// ---------------------------------------------------------------------------
const INCIDENT_STATUSES = Object.freeze({
  ACTIVE:    "active",
  CONTAINED: "contained",
  RESOLVED:  "resolved",
})

const _KNOWN_STATUSES = new Set(Object.values(INCIDENT_STATUSES))

// Statuses that still enforce containment
const _ENFORCING_STATUSES = new Set([INCIDENT_STATUSES.ACTIVE, INCIDENT_STATUSES.CONTAINED])

// ---------------------------------------------------------------------------
// Containment thresholds
// ---------------------------------------------------------------------------
const CONTAINMENT_THRESHOLDS = Object.freeze({
  BLOCK_PRIVILEGED_EXECUTION: INCIDENT_SEVERITIES.CRITICAL,  // critical+
  RESTRICT_SENSITIVE_ROUTES:  INCIDENT_SEVERITIES.HIGH,       // high+
})

// ---------------------------------------------------------------------------
// In-memory incident registry
// incident_id → { incident_id, incident_status, incident_severity, incident_scope,
//                 declared_at, contained_at, resolved_at, notes }
// ---------------------------------------------------------------------------
const _incidents = new Map()

// ---------------------------------------------------------------------------
// declareIncident — register a new active incident
// ---------------------------------------------------------------------------
function declareIncident({ severity, scope, notes }) {
  const sev   = String(severity || "").trim().toLowerCase()
  const sc    = String(scope    || "").trim()
  const n     = String(notes    || "").trim()
  if (!sev || !_KNOWN_SEVERITIES.has(sev)) {
    return { ok: false, reason: "unknown_severity", severity: sev || null }
  }
  const id    = `inc_${crypto.randomUUID()}`
  const entry = {
    incident_id:               id,
    incident_status:           INCIDENT_STATUSES.ACTIVE,
    incident_severity:         sev,
    incident_scope:            sc || "general",
    notes:                     n,
    incident_governance_version: INCIDENT_GOVERNANCE_VERSION,
    declared_at:               new Date().toISOString(),
    contained_at:              null,
    resolved_at:               null,
  }
  _incidents.set(id, entry)
  return { ok: true, data: { ...entry } }
}

// ---------------------------------------------------------------------------
// containIncident — transition to contained
// ---------------------------------------------------------------------------
function containIncident(incidentId) {
  const id    = String(incidentId || "").trim()
  const entry = _incidents.get(id)
  if (!entry) return { ok: false, reason: "unknown_incident_id" }
  if (entry.incident_status === INCIDENT_STATUSES.RESOLVED)  return { ok: false, reason: "already_resolved" }
  if (entry.incident_status === INCIDENT_STATUSES.CONTAINED) return { ok: false, reason: "already_contained" }
  const updated = { ...entry, incident_status: INCIDENT_STATUSES.CONTAINED, contained_at: new Date().toISOString() }
  _incidents.set(id, updated)
  return { ok: true, data: { ...updated } }
}

// ---------------------------------------------------------------------------
// resolveIncident — transition to resolved (no longer enforced)
// ---------------------------------------------------------------------------
function resolveIncident(incidentId) {
  const id    = String(incidentId || "").trim()
  const entry = _incidents.get(id)
  if (!entry) return { ok: false, reason: "unknown_incident_id" }
  if (entry.incident_status === INCIDENT_STATUSES.RESOLVED) return { ok: false, reason: "already_resolved" }
  const updated = { ...entry, incident_status: INCIDENT_STATUSES.RESOLVED, resolved_at: new Date().toISOString() }
  _incidents.set(id, updated)
  return { ok: true, data: { ...updated } }
}

// ---------------------------------------------------------------------------
// getActiveIncidents — returns all active and contained incidents
// ---------------------------------------------------------------------------
function getActiveIncidents() {
  return Array.from(_incidents.values())
    .filter(e => _ENFORCING_STATUSES.has(e.incident_status))
    .map(e => ({ ...e }))
}

// ---------------------------------------------------------------------------
// hasActiveIncidentAtOrAbove — containment check: true if any enforcing
// incident has severity >= the threshold severity
// ---------------------------------------------------------------------------
function hasActiveIncidentAtOrAbove(thresholdSeverity) {
  const thresh = _SEVERITY_RANK[thresholdSeverity]
  if (!thresh) return false
  for (const entry of _incidents.values()) {
    if (!_ENFORCING_STATUSES.has(entry.incident_status)) continue
    if ((_SEVERITY_RANK[entry.incident_severity] || 0) >= thresh) return true
  }
  return false
}

// ---------------------------------------------------------------------------
// getHighestActiveSeverity — returns the highest severity of any active incident
// ---------------------------------------------------------------------------
function getHighestActiveSeverity() {
  let max = 0
  let sev = null
  for (const entry of _incidents.values()) {
    if (!_ENFORCING_STATUSES.has(entry.incident_status)) continue
    const rank = _SEVERITY_RANK[entry.incident_severity] || 0
    if (rank > max) { max = rank; sev = entry.incident_severity }
  }
  return sev
}

// ---------------------------------------------------------------------------
// getGovernanceState — read-only snapshot
// ---------------------------------------------------------------------------
function getGovernanceState() {
  const incidents         = Array.from(_incidents.values()).map(i => ({ ...i }))
  const active_incidents  = incidents.filter(i => _ENFORCING_STATUSES.has(i.incident_status))
  const highest_severity  = getHighestActiveSeverity()
  return {
    incident_count:          incidents.length,
    active_incident_count:   active_incidents.length,
    highest_active_severity: highest_severity,
    containment_active:      active_incidents.length > 0,
    incidents,
  }
}

// ---------------------------------------------------------------------------
// exportGovernance — write JSON artifact (does not mutate state)
// ---------------------------------------------------------------------------
function exportGovernance(outputPath) {
  const state    = getGovernanceState()
  const artifact = {
    exported_at:                  new Date().toISOString(),
    incident_governance_version:  INCIDENT_GOVERNANCE_VERSION,
    incident_count:               state.incident_count,
    active_incident_count:        state.active_incident_count,
    highest_active_severity:      state.highest_active_severity,
    containment_active:           state.containment_active,
    containment_thresholds:       CONTAINMENT_THRESHOLDS,
    incidents:                    state.incidents,
  }
  if (outputPath) {
    fs.writeFileSync(outputPath, JSON.stringify(artifact, null, 2) + "\n", "utf8")
  }
  return artifact
}

module.exports = {
  INCIDENT_GOVERNANCE_VERSION,
  INCIDENT_SEVERITIES,
  INCIDENT_STATUSES,
  CONTAINMENT_THRESHOLDS,
  declareIncident,
  containIncident,
  resolveIncident,
  getActiveIncidents,
  hasActiveIncidentAtOrAbove,
  getHighestActiveSeverity,
  getGovernanceState,
  exportGovernance,
}
