function applyJurisdictionBridgeRule(fromJurisdiction, toJurisdiction) {
  return {
    from_jurisdiction: fromJurisdiction,
    to_jurisdiction: toJurisdiction,
    bridge_rule: fromJurisdiction + "_TO_" + toJurisdiction,
    applied_at: new Date().toISOString()
  }
}

module.exports = applyJurisdictionBridgeRule
