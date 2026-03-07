function executeProtocolRequest(target, payload) {
  return {
    target,
    payload,
    executed_at: new Date().toISOString()
  }
}

module.exports = executeProtocolRequest
