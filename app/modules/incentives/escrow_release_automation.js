class EscrowReleaseAutomation {
  constructor() {
    this.releases = new Map()
  }

  release(escrowId, amount) {
    const record = {
      escrow_id: escrowId,
      released_amount: amount,
      released_at: new Date().toISOString()
    }

    this.releases.set(escrowId, record)
    return record
  }

  get(escrowId) {
    return this.releases.get(escrowId) || null
  }
}

module.exports = new EscrowReleaseAutomation()
