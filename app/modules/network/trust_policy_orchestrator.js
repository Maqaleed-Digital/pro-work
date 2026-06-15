function applyTrustPolicy(policyId, target) {
  return {
    policy_id: policyId,
    applied_to: target,
    applied_at: new Date().toISOString()
  }
}

module.exports = applyTrustPolicy
