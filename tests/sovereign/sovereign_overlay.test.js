const test = require("node:test")
const assert = require("node:assert")

const applyRule = require("../../app/modules/sovereign/regulatory_trust_rules")
const resolveOverlay = require("../../app/modules/sovereign/jurisdiction_overlay")
const validateVerifier = require("../../app/modules/sovereign/sovereign_verifier_controls")
const evaluateGate = require("../../app/modules/sovereign/compliance_settlement_gate")
const exportAudit = require("../../app/modules/sovereign/policy_audit_export")

test("regulatory trust rule applies", () => {
  const result = applyRule("rule1", "network1")
  assert.equal(result.applied, true)
})

test("jurisdiction overlay resolves", () => {
  const result = resolveOverlay("KSA")
  assert.equal(result.overlay, "KSA_OVERLAY")
})

test("sovereign verifier control validates", () => {
  const result = validateVerifier("verifier1", "KSA")
  assert.equal(result.allowed, true)
})

test("compliance settlement gate evaluates", () => {
  const result = evaluateGate("settlement1", true)
  assert.equal(result.passed, true)
})

test("policy audit export counts entries", () => {
  const result = exportAudit("policy1", [{ id: 1 }, { id: 2 }])
  assert.equal(result.entry_count, 2)
})
