function balanceIncentive(values) {
  const total = values.reduce((sum, v) => sum + v, 0)
  const average = values.length ? total / values.length : 0

  return {
    total,
    average,
    balanced_at: new Date().toISOString()
  }
}

module.exports = balanceIncentive
