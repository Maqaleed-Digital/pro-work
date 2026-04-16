function settleCredential(credentialId, amount) {
  return {
    credential_id: credentialId,
    settled_amount: amount,
    settled_at: new Date().toISOString()
  }
}

module.exports = settleCredential
