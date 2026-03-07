function evaluateComplianceSettlementGate(settlementId, compliant) {
  return {
    settlement_id: settlementId,
    passed: Boolean(compliant),
    evaluated_at: new Date().toISOString()
  }
}

module.exports = evaluateComplianceSettlementGate
