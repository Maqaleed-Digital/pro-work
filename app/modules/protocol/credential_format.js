function validateCredentialFormat(credential) {
  return {
    credential_id: credential.credential_id,
    valid: Boolean(credential.credential_id),
    validated_at: new Date().toISOString()
  }
}

module.exports = validateCredentialFormat
