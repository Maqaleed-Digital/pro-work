class TrustEscrow {
  constructor() {
    this.escrows = new Map()
  }

  create(escrowId, amount) {
    this.escrows.set(escrowId, amount)

    return {
      escrow_id: escrowId,
      amount
    }
  }

  get(escrowId) {
    return this.escrows.get(escrowId) || 0
  }
}

module.exports = new TrustEscrow()
