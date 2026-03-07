'use strict';

function now() {
  return new Date().toISOString();
}

function clone(v) {
  return JSON.parse(JSON.stringify(v));
}

class LiquidityPoolRegistry {
  constructor() {
    this.pools = new Map();
  }

  createPool(input) {
    const id = input.pool_id;
    if (!id) throw new Error('POOL_ID_REQUIRED');
    if (this.pools.has(id)) throw new Error('POOL_EXISTS');

    const rec = {
      pool_id: id,
      network_id: input.network_id,
      reserve_id: input.reserve_id,
      liquidity_balance: Number(input.liquidity_balance || 0),
      allocated_liquidity: 0,
      utilization_ratio: 0,
      created_at: now(),
      updated_at: now()
    };

    this.pools.set(id, rec);
    return clone(rec);
  }

  allocate(poolId, amount) {
    const rec = this.pools.get(poolId);
    if (!rec) throw new Error('POOL_NOT_FOUND');

    const n = Number(amount);
    if (rec.liquidity_balance < n) {
      throw new Error('INSUFFICIENT_LIQUIDITY');
    }

    rec.liquidity_balance -= n;
    rec.allocated_liquidity += n;
    rec.utilization_ratio =
      rec.allocated_liquidity /
      (rec.liquidity_balance + rec.allocated_liquidity);

    rec.updated_at = now();
    return clone(rec);
  }

  release(poolId, amount) {
    const rec = this.pools.get(poolId);
    if (!rec) throw new Error('POOL_NOT_FOUND');

    const n = Number(amount);

    rec.allocated_liquidity -= n;
    rec.liquidity_balance += n;

    rec.utilization_ratio =
      rec.allocated_liquidity /
      (rec.liquidity_balance + rec.allocated_liquidity);

    rec.updated_at = now();

    return clone(rec);
  }

  listPools() {
    return Array.from(this.pools.values()).map(clone);
  }
}

module.exports = {
  LiquidityPoolRegistry
};
