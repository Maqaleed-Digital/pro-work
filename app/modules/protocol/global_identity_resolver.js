function resolveGlobalIdentity(identityId) {
  return {
    identity_id: identityId,
    resolved: true,
    resolved_at: new Date().toISOString()
  }
}

module.exports = resolveGlobalIdentity
