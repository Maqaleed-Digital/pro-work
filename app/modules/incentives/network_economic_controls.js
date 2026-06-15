function applyNetworkEconomicControl(controlId, target) {
  return {
    control_id: controlId,
    target,
    applied_at: new Date().toISOString()
  }
}

module.exports = applyNetworkEconomicControl
