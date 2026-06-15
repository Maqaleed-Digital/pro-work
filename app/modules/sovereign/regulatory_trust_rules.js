function applyRegulatoryTrustRule(ruleId, target) {
  return {
    rule_id: ruleId,
    target,
    applied: true,
    applied_at: new Date().toISOString()
  }
}

module.exports = applyRegulatoryTrustRule
