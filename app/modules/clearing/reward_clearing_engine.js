function clearReward(recipientId, amount, jurisdiction) {
  return {
    recipient_id: recipientId,
    cleared_amount: amount,
    jurisdiction,
    cleared_at: new Date().toISOString()
  }
}

module.exports = clearReward
