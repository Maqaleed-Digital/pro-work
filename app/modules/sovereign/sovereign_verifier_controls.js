function validateSovereignVerifier(verifierId, jurisdiction) {
  return {
    verifier_id: verifierId,
    jurisdiction,
    allowed: true,
    validated_at: new Date().toISOString()
  }
}

module.exports = validateSovereignVerifier
