"use strict"

/**
 * PROWORK PHASE 20 — Business Continuity + Disaster Recovery Governance
 *
 * Provides:
 * - Continuity mode catalog (normal, degraded, failover)
 * - Recovery state catalog (standby, active_recovery, restored)
 * - In-memory current mode and state (defaults: normal / standby)
 * - Transition history log (for audit/export)
 * - validateContinuityMode(): fail-closed on unknown mode
 * - validateRecoveryState(): fail-closed on unknown state
 * - setContinuityMode(): admin/test mutation
 * - setRecoveryState(): admin/test mutation
 * - getCurrentMode(): current continuity mode
 * - getCurrentRecoveryState(): current DR recovery state
 * - isRestrictedContinuityMode(mode): true for degraded and failover
 * - isRestrictedRecoveryState(state): true for active_recovery
 * - getGovernanceState(): read-only snapshot
 * - exportGovernance(): machine-readable artifact (no state mutation)
 *
 * Rules:
 * - unknown continuity mode → fail closed (reason: "unknown_continuity_mode")
 * - unknown recovery state → fail closed (reason: "unknown_recovery_state")
 * - degraded mode → restricts privileged proof paths (reason: "degraded_mode_restriction")
 * - failover mode → restricts privileged proof paths (reason: "failover_mode_restriction")
 * - active_recovery state → restricts mutation/release paths (reason: "active_recovery_restriction")
 * - normal mode + standby/restored state → passes continuity/DR gate
 */

const fs     = require("fs")
const crypto = require("crypto")

// ---------------------------------------------------------------------------
// Schema version
// ---------------------------------------------------------------------------
const CONTINUITY_DR_VERSION = "1.0"

// ---------------------------------------------------------------------------
// Continuity mode catalog
// ---------------------------------------------------------------------------
const CONTINUITY_MODES = Object.freeze({
  NORMAL:   "normal",
  DEGRADED: "degraded",
  FAILOVER: "failover",
})

const _KNOWN_CONTINUITY_MODES = new Set(Object.values(CONTINUITY_MODES))

// Modes that restrict governed privileged execution proof paths
const _RESTRICTED_CONTINUITY_MODES = new Set([CONTINUITY_MODES.DEGRADED, CONTINUITY_MODES.FAILOVER])

// ---------------------------------------------------------------------------
// DR recovery state catalog
// ---------------------------------------------------------------------------
const RECOVERY_STATES = Object.freeze({
  STANDBY:         "standby",
  ACTIVE_RECOVERY: "active_recovery",
  RESTORED:        "restored",
})

const _KNOWN_RECOVERY_STATES = new Set(Object.values(RECOVERY_STATES))

// States that restrict mutation/release paths
const _RESTRICTED_RECOVERY_STATES = new Set([RECOVERY_STATES.ACTIVE_RECOVERY])

// ---------------------------------------------------------------------------
// In-memory current system state (defaults: normal / standby)
// ---------------------------------------------------------------------------
let _currentMode          = CONTINUITY_MODES.NORMAL
let _currentRecoveryState = RECOVERY_STATES.STANDBY
const _transitionLog      = []   // [{type, from, to, set_at, set_by}]

// ---------------------------------------------------------------------------
// validateContinuityMode — fail-closed on unknown mode
// ---------------------------------------------------------------------------
function validateContinuityMode(mode) {
  const m = String(mode || "").trim().toLowerCase()
  if (!m || !_KNOWN_CONTINUITY_MODES.has(m)) {
    return { ok: false, reason: "unknown_continuity_mode", continuity_mode: m || null }
  }
  return { ok: true, continuity_mode: m }
}

// ---------------------------------------------------------------------------
// validateRecoveryState — fail-closed on unknown state
// ---------------------------------------------------------------------------
function validateRecoveryState(state) {
  const s = String(state || "").trim().toLowerCase()
  if (!s || !_KNOWN_RECOVERY_STATES.has(s)) {
    return { ok: false, reason: "unknown_recovery_state", recovery_state: s || null }
  }
  return { ok: true, recovery_state: s }
}

// ---------------------------------------------------------------------------
// isRestrictedContinuityMode — true for degraded and failover
// ---------------------------------------------------------------------------
function isRestrictedContinuityMode(mode) {
  const m = String(mode || "").trim().toLowerCase()
  return _RESTRICTED_CONTINUITY_MODES.has(m)
}

// ---------------------------------------------------------------------------
// isRestrictedRecoveryState — true for active_recovery
// ---------------------------------------------------------------------------
function isRestrictedRecoveryState(state) {
  const s = String(state || "").trim().toLowerCase()
  return _RESTRICTED_RECOVERY_STATES.has(s)
}

// ---------------------------------------------------------------------------
// setContinuityMode — in-memory admin/test mutation
// ---------------------------------------------------------------------------
function setContinuityMode(mode, setBy) {
  const check = validateContinuityMode(mode)
  if (!check.ok) return { ok: false, reason: check.reason }
  const prev = _currentMode
  _currentMode = check.continuity_mode
  _transitionLog.push({
    type: "continuity_mode_change", from: prev, to: _currentMode,
    set_at: new Date().toISOString(), set_by: setBy || "system",
  })
  return { ok: true, previous_mode: prev, current_mode: _currentMode }
}

// ---------------------------------------------------------------------------
// setRecoveryState — in-memory admin/test mutation
// ---------------------------------------------------------------------------
function setRecoveryState(state, setBy) {
  const check = validateRecoveryState(state)
  if (!check.ok) return { ok: false, reason: check.reason }
  const prev = _currentRecoveryState
  _currentRecoveryState = check.recovery_state
  _transitionLog.push({
    type: "recovery_state_change", from: prev, to: _currentRecoveryState,
    set_at: new Date().toISOString(), set_by: setBy || "system",
  })
  return { ok: true, previous_state: prev, current_state: _currentRecoveryState }
}

// ---------------------------------------------------------------------------
// getCurrentMode — read current continuity mode
// ---------------------------------------------------------------------------
function getCurrentMode()          { return _currentMode }
function getCurrentRecoveryState() { return _currentRecoveryState }

// ---------------------------------------------------------------------------
// getGovernanceState — read-only snapshot
// ---------------------------------------------------------------------------
function getGovernanceState() {
  return {
    continuity_mode:         _currentMode,
    recovery_state:          _currentRecoveryState,
    continuity_mode_restricted: isRestrictedContinuityMode(_currentMode),
    recovery_state_restricted:  isRestrictedRecoveryState(_currentRecoveryState),
    available_continuity_modes: Object.values(CONTINUITY_MODES),
    available_recovery_states:  Object.values(RECOVERY_STATES),
    transition_count:           _transitionLog.length,
    transitions:                _transitionLog.map(t => ({ ...t })),
  }
}

// ---------------------------------------------------------------------------
// exportGovernance — write JSON artifact (does not mutate state)
// ---------------------------------------------------------------------------
function exportGovernance(outputPath) {
  const state    = getGovernanceState()
  const artifact = {
    exported_at:              new Date().toISOString(),
    continuity_dr_version:    CONTINUITY_DR_VERSION,
    continuity_mode:          state.continuity_mode,
    recovery_state:           state.recovery_state,
    continuity_mode_restricted: state.continuity_mode_restricted,
    recovery_state_restricted:  state.recovery_state_restricted,
    available_continuity_modes: state.available_continuity_modes,
    available_recovery_states:  state.available_recovery_states,
    transition_count:           state.transition_count,
    transitions:                state.transitions,
  }
  if (outputPath) {
    fs.writeFileSync(outputPath, JSON.stringify(artifact, null, 2) + "\n", "utf8")
  }
  return artifact
}

module.exports = {
  CONTINUITY_DR_VERSION,
  CONTINUITY_MODES,
  RECOVERY_STATES,
  validateContinuityMode,
  validateRecoveryState,
  isRestrictedContinuityMode,
  isRestrictedRecoveryState,
  setContinuityMode,
  setRecoveryState,
  getCurrentMode,
  getCurrentRecoveryState,
  getGovernanceState,
  exportGovernance,
}
