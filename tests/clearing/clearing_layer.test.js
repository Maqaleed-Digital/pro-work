const test = require("node:test")
const assert = require("node:assert")

const clearTrust = require("../../app/modules/clearing/cross_network_trust_clearing")
const reconcileSettlement = require("../../app/modules/clearing/settlement_reconciliation")
const routeDispute = require("../../app/modules/clearing/global_dispute_router")
const clearReward = require("../../app/modules/clearing/reward_clearing_engine")
const auditLedger = require("../../app/modules/clearing/clearing_audit_ledger")

test("cross-network trust clearing returns cleared amount", () => {
  const result = clearTrust("fabricA", "fabricB", 100)
  assert.equal(result.cleared_amount, 100)
})

test("settlement reconciliation marks reconciled", () => {
  const result = reconcileSettlement("settlement1", "MATCHED")
  assert.equal(result.reconciled, true)
})

test("global dispute router routes dispute", () => {
  const result = routeDispute("dispute1", "KSA")
  assert.equal(result.routed, true)
})

test("reward clearing returns jurisdiction", () => {
  const result = clearReward("user1", 25, "UAE")
  assert.equal(result.jurisdiction, "UAE")
})

test("clearing audit ledger appends entry", () => {
  const result = auditLedger.append({ id: 1 })
  assert.equal(result.appended, true)
  assert.equal(auditLedger.list().length >= 1, true)
})
