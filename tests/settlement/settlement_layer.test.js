const test = require("node:test")
const assert = require("node:assert")

const settleCredential = require("../../app/modules/settlement/credential_settlement_engine")
const collateralRegistry = require("../../app/modules/settlement/reputation_collateral_registry")
const escrow = require("../../app/modules/settlement/trust_escrow")
const distributeReward = require("../../app/modules/settlement/network_reward_distributor")
const backedPool = require("../../app/modules/settlement/credential_backed_pool")

test("credential settlement returns settled amount", () => {
  const result = settleCredential("cred1", 100)
  assert.equal(result.settled_amount, 100)
})

test("collateral registry stores amount", () => {
  collateralRegistry.pledge("actor1", 50)
  assert.equal(collateralRegistry.get("actor1"), 50)
})

test("trust escrow stores amount", () => {
  escrow.create("esc1", 75)
  assert.equal(escrow.get("esc1"), 75)
})

test("reward distributor returns recipient", () => {
  const result = distributeReward("user1", 25)
  assert.equal(result.recipient_id, "user1")
})

test("credential backed pool stores credential", () => {
  const result = backedPool.create("pool1", "cred1")
  assert.equal(result.backing_credential, "cred1")
})
