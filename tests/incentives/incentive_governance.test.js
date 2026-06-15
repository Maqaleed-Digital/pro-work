const test = require("node:test")
const assert = require("node:assert")

const settlementAgent = require("../../app/modules/incentives/settlement_agent_runtime")
const applyRewardPolicy = require("../../app/modules/incentives/reward_policy_engine")
const escrowAutomation = require("../../app/modules/incentives/escrow_release_automation")
const balanceIncentive = require("../../app/modules/incentives/incentive_balancer")
const applyEconomicControl = require("../../app/modules/incentives/network_economic_controls")

test("settlement agent executes settlement", () => {
  const result = settlementAgent.execute("agent1", "settlement1")
  assert.equal(result.status, "executed")
})

test("reward policy engine returns adjusted amount", () => {
  const result = applyRewardPolicy("policy1", 100)
  assert.equal(result.adjusted_amount, 100)
})

test("escrow release automation stores release", () => {
  const result = escrowAutomation.release("escrow1", 75)
  assert.equal(result.released_amount, 75)
  assert.equal(escrowAutomation.get("escrow1").escrow_id, "escrow1")
})

test("incentive balancer returns average", () => {
  const result = balanceIncentive([10, 20, 30])
  assert.equal(result.average, 20)
})

test("network economic control applies control", () => {
  const result = applyEconomicControl("control1", "pool1")
  assert.equal(result.control_id, "control1")
})
