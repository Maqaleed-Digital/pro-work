function routeGlobalDispute(disputeId, jurisdiction) {
  return {
    dispute_id: disputeId,
    jurisdiction,
    routed: true,
    routed_at: new Date().toISOString()
  }
}

module.exports = routeGlobalDispute
