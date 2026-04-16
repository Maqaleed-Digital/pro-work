const test = require("node:test")
const assert = require("node:assert")

const applyBridge = require("../../app/modules/interoperability/jurisdiction_bridge_rules")
const verifierMap = require("../../app/modules/interoperability/cross_border_verifier_map")
const validateMulti = require("../../app/modules/interoperability/multi_sovereign_validator")
const translateEquivalency = require("../../app/modules/interoperability/regulatory_equivalency_translator")
const buildAuditChain = require("../../app/modules/interoperability/interoperability_audit_chain")

test("jurisdiction bridge rule applies", () => {
  const result = applyBridge("KSA", "UAE")
  assert.equal(result.bridge_rule, "KSA_TO_UAE")
})

test("cross-border verifier map stores mapping", () => {
  verifierMap.register("ksaVerifier", "uaeVerifier")
  assert.equal(verifierMap.get("ksaVerifier"), "uaeVerifier")
})

test("multi-sovereign validator returns valid", () => {
  const result = validateMulti("cred1", ["KSA", "UAE"])
  assert.equal(result.valid, true)
  assert.equal(result.jurisdiction_count, 2)
})

test("regulatory equivalency translates", () => {
  const result = translateEquivalency("RULE_A", "UAE")
  assert.equal(result.translated_rule, "RULE_A_FOR_UAE")
})

test("interoperability audit chain counts entries", () => {
  const result = buildAuditChain([{ id: 1 }, { id: 2 }, { id: 3 }])
  assert.equal(result.entry_count, 3)
})
