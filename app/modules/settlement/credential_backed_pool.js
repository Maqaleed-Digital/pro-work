class CredentialBackedPool {
  constructor() {
    this.pools = new Map()
  }

  create(poolId, credentialId) {
    this.pools.set(poolId, credentialId)

    return {
      pool_id: poolId,
      backing_credential: credentialId
    }
  }

  get(poolId) {
    return this.pools.get(poolId) || null
  }
}

module.exports = new CredentialBackedPool()
