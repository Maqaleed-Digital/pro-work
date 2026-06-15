function applyRewardPolicy(policyId, amount) {
  return {
    policy_id: policyId,
    adjusted_amount: amount,
    applied_at: new Date().toISOString()
  }
}

module.exports = applyRewardPolicy
