function reconcileSettlement(settlementId, status) {
  return {
    settlement_id: settlementId,
    reconciled: true,
    status,
    reconciled_at: new Date().toISOString()
  }
}

module.exports = reconcileSettlement
