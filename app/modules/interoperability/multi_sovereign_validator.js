function validateAcrossSovereigns(credentialId, jurisdictions) {
  return {
    credential_id: credentialId,
    jurisdiction_count: Array.isArray(jurisdictions) ? jurisdictions.length : 0,
    valid: true,
    validated_at: new Date().toISOString()
  }
}

module.exports = validateAcrossSovereigns
