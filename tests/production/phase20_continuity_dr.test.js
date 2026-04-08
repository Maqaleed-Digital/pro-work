"use strict"

/**
 * Phase 20 — Business Continuity + Disaster Recovery Governance unit tests
 * Framework: node:test + node:assert (native, no dependencies)
 */

const { describe, it, before } = require("node:test")
const assert = require("node:assert/strict")

const {
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
} = require("../../app/lib/continuity_dr")

// Reset to normal/standby before all tests
before(() => {
  setContinuityMode("normal", "test-setup")
  setRecoveryState("standby", "test-setup")
})

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
describe("CONTINUITY_DR_VERSION", () => {
  it("exports a non-empty string", () => {
    assert.equal(typeof CONTINUITY_DR_VERSION, "string")
    assert.ok(CONTINUITY_DR_VERSION.length > 0)
  })
})

describe("CONTINUITY_MODES", () => {
  it("has normal, degraded, failover", () => {
    assert.equal(CONTINUITY_MODES.NORMAL,   "normal")
    assert.equal(CONTINUITY_MODES.DEGRADED, "degraded")
    assert.equal(CONTINUITY_MODES.FAILOVER, "failover")
    assert.equal(Object.keys(CONTINUITY_MODES).length, 3)
  })
})

describe("RECOVERY_STATES", () => {
  it("has standby, active_recovery, restored", () => {
    assert.equal(RECOVERY_STATES.STANDBY,         "standby")
    assert.equal(RECOVERY_STATES.ACTIVE_RECOVERY, "active_recovery")
    assert.equal(RECOVERY_STATES.RESTORED,        "restored")
    assert.equal(Object.keys(RECOVERY_STATES).length, 3)
  })
})

// ---------------------------------------------------------------------------
// validateContinuityMode
// ---------------------------------------------------------------------------
describe("validateContinuityMode", () => {
  it("accepts normal", () => {
    const r = validateContinuityMode("normal")
    assert.equal(r.ok, true)
    assert.equal(r.continuity_mode, "normal")
  })
  it("accepts degraded", () => {
    assert.equal(validateContinuityMode("degraded").ok, true)
  })
  it("accepts failover", () => {
    assert.equal(validateContinuityMode("failover").ok, true)
  })
  it("normalizes to lowercase", () => {
    const r = validateContinuityMode("NORMAL")
    assert.equal(r.ok, true)
    assert.equal(r.continuity_mode, "normal")
  })
  it("rejects unknown mode", () => {
    const r = validateContinuityMode("disaster")
    assert.equal(r.ok, false)
    assert.equal(r.reason, "unknown_continuity_mode")
  })
  it("rejects empty string", () => {
    assert.equal(validateContinuityMode("").ok, false)
  })
  it("rejects null", () => {
    assert.equal(validateContinuityMode(null).ok, false)
  })
})

// ---------------------------------------------------------------------------
// validateRecoveryState
// ---------------------------------------------------------------------------
describe("validateRecoveryState", () => {
  it("accepts standby", () => {
    const r = validateRecoveryState("standby")
    assert.equal(r.ok, true)
    assert.equal(r.recovery_state, "standby")
  })
  it("accepts active_recovery", () => {
    assert.equal(validateRecoveryState("active_recovery").ok, true)
  })
  it("accepts restored", () => {
    assert.equal(validateRecoveryState("restored").ok, true)
  })
  it("normalizes to lowercase", () => {
    const r = validateRecoveryState("STANDBY")
    assert.equal(r.ok, true)
    assert.equal(r.recovery_state, "standby")
  })
  it("rejects unknown state", () => {
    const r = validateRecoveryState("paused")
    assert.equal(r.ok, false)
    assert.equal(r.reason, "unknown_recovery_state")
  })
  it("rejects empty string", () => {
    assert.equal(validateRecoveryState("").ok, false)
  })
  it("rejects null", () => {
    assert.equal(validateRecoveryState(null).ok, false)
  })
})

// ---------------------------------------------------------------------------
// isRestrictedContinuityMode
// ---------------------------------------------------------------------------
describe("isRestrictedContinuityMode", () => {
  it("normal is not restricted", () => {
    assert.equal(isRestrictedContinuityMode("normal"), false)
  })
  it("degraded is restricted", () => {
    assert.equal(isRestrictedContinuityMode("degraded"), true)
  })
  it("failover is restricted", () => {
    assert.equal(isRestrictedContinuityMode("failover"), true)
  })
  it("unknown is not restricted (validation happens separately)", () => {
    assert.equal(isRestrictedContinuityMode("unknown"), false)
  })
})

// ---------------------------------------------------------------------------
// isRestrictedRecoveryState
// ---------------------------------------------------------------------------
describe("isRestrictedRecoveryState", () => {
  it("standby is not restricted", () => {
    assert.equal(isRestrictedRecoveryState("standby"), false)
  })
  it("active_recovery is restricted", () => {
    assert.equal(isRestrictedRecoveryState("active_recovery"), true)
  })
  it("restored is not restricted", () => {
    assert.equal(isRestrictedRecoveryState("restored"), false)
  })
})

// ---------------------------------------------------------------------------
// setContinuityMode + getCurrentMode
// ---------------------------------------------------------------------------
describe("setContinuityMode / getCurrentMode", () => {
  it("sets known mode and returns previous", () => {
    setContinuityMode("normal", "test") // ensure starting state
    const r = setContinuityMode("degraded", "test-actor")
    assert.equal(r.ok, true)
    assert.equal(r.previous_mode, "normal")
    assert.equal(r.current_mode, "degraded")
    assert.equal(getCurrentMode(), "degraded")
  })
  it("rejects unknown mode", () => {
    const r = setContinuityMode("chaos", "test")
    assert.equal(r.ok, false)
    assert.equal(r.reason, "unknown_continuity_mode")
  })
  it("restores to normal", () => {
    setContinuityMode("normal", "test")
    assert.equal(getCurrentMode(), "normal")
  })
})

// ---------------------------------------------------------------------------
// setRecoveryState + getCurrentRecoveryState
// ---------------------------------------------------------------------------
describe("setRecoveryState / getCurrentRecoveryState", () => {
  it("sets known state and returns previous", () => {
    setRecoveryState("standby", "test")  // ensure starting state
    const r = setRecoveryState("active_recovery", "test-actor")
    assert.equal(r.ok, true)
    assert.equal(r.previous_state, "standby")
    assert.equal(r.current_state, "active_recovery")
    assert.equal(getCurrentRecoveryState(), "active_recovery")
  })
  it("rejects unknown state", () => {
    const r = setRecoveryState("recovering_fast", "test")
    assert.equal(r.ok, false)
    assert.equal(r.reason, "unknown_recovery_state")
  })
  it("transitions to restored", () => {
    setRecoveryState("restored", "test")
    assert.equal(getCurrentRecoveryState(), "restored")
  })
  it("restores to standby", () => {
    setRecoveryState("standby", "test")
    assert.equal(getCurrentRecoveryState(), "standby")
  })
})

// ---------------------------------------------------------------------------
// getGovernanceState
// ---------------------------------------------------------------------------
describe("getGovernanceState", () => {
  it("returns required fields", () => {
    setContinuityMode("normal", "test")
    setRecoveryState("standby", "test")
    const s = getGovernanceState()
    assert.equal(s.continuity_mode, "normal")
    assert.equal(s.recovery_state, "standby")
    assert.equal(typeof s.continuity_mode_restricted, "boolean")
    assert.equal(typeof s.recovery_state_restricted, "boolean")
    assert.ok(Array.isArray(s.available_continuity_modes))
    assert.ok(Array.isArray(s.available_recovery_states))
    assert.ok(Array.isArray(s.transitions))
  })
  it("reflects restricted state correctly", () => {
    setContinuityMode("degraded", "test")
    const s = getGovernanceState()
    assert.equal(s.continuity_mode_restricted, true)
    setContinuityMode("normal", "test")
  })
  it("returns snapshots (not references)", () => {
    const s1 = getGovernanceState()
    const s2 = getGovernanceState()
    assert.notEqual(s1, s2)
  })
})

// ---------------------------------------------------------------------------
// exportGovernance
// ---------------------------------------------------------------------------
describe("exportGovernance", () => {
  it("returns artifact with required fields", () => {
    setContinuityMode("normal", "test")
    setRecoveryState("standby", "test")
    const a = exportGovernance()
    assert.ok(a.exported_at)
    assert.ok(a.continuity_dr_version)
    assert.ok(a.continuity_mode)
    assert.ok(a.recovery_state)
    assert.ok(typeof a.continuity_mode_restricted === "boolean")
    assert.ok(typeof a.recovery_state_restricted === "boolean")
    assert.ok(Array.isArray(a.available_continuity_modes))
    assert.ok(Array.isArray(a.available_recovery_states))
    assert.ok(typeof a.transition_count === "number")
  })
  it("does not mutate state on repeated calls", () => {
    const a1 = exportGovernance()
    const a2 = exportGovernance()
    assert.equal(a1.continuity_mode, a2.continuity_mode)
    assert.equal(a1.recovery_state,  a2.recovery_state)
  })
})
