const test = require("node:test")
const assert = require("node:assert")

const governance = require("../../app/modules/network/network_governance_engine")
const consensus = require("../../app/modules/network/fabric_consensus_layer")
const applyPolicy = require("../../app/modules/network/trust_policy_orchestrator")
const coordinateAgents = require("../../app/modules/network/federated_agent_coordinator")
const generateSignal = require("../../app/modules/network/network_signal_dashboard")

test("governance engine registers node", () => {
  const result = governance.registerNode("node1", "https://node.example")
  assert.equal(result.registered, true)
})

test("fabric consensus returns true", () => {
  const result = consensus(["node1", "node2"])
  assert.equal(result.consensus, true)
})

test("policy orchestrator applies policy", () => {
  const result = applyPolicy("policyA", "node1")
  assert.equal(result.policy_id, "policyA")
})

test("agent coordinator counts agents", () => {
  const result = coordinateAgents(["a", "b"])
  assert.equal(result.coordinated_agents, 2)
})

test("network signal generated", () => {
  const result = generateSignal("NETWORK_OK")
  assert.equal(result.signal, "NETWORK_OK")
})
