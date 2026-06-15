function federateIdentity(identityId, network) {
  return {
    identity_id: identityId,
    network,
    federated: true,
    federated_at: new Date().toISOString()
  }
}

module.exports = federateIdentity
