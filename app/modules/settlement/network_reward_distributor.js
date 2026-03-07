function distributeReward(recipientId, amount) {
  return {
    recipient_id: recipientId,
    reward_amount: amount,
    distributed_at: new Date().toISOString()
  }
}

module.exports = distributeReward
