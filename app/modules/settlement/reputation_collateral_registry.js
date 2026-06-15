class ReputationCollateralRegistry {
  constructor() {
    this.registry = new Map()
  }

  pledge(actorId, amount) {
    this.registry.set(actorId, amount)

    return {
      actor_id: actorId,
      collateral_amount: amount
    }
  }

  get(actorId) {
    return this.registry.get(actorId) || 0
  }
}

module.exports = new ReputationCollateralRegistry()
