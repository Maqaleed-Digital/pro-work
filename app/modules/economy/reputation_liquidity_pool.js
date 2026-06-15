'use strict';

class ReputationLiquidityPool {
  constructor() {
    this.pools = new Map();
  }

  create(poolId, initialValue) {
    this.pools.set(poolId, initialValue);
    return { pool_id: poolId, liquidity: initialValue };
  }

  get(poolId) {
    return this.pools.get(poolId) || 0;
  }
}

module.exports = new ReputationLiquidityPool();
