'use strict';

function allocateAcrossPools(pools, demand) {

  const sorted = [...pools].sort(
    (a,b)=> a.utilization_ratio - b.utilization_ratio
  );

  const allocations = [];
  let remaining = demand;

  for (const p of sorted) {
    if (remaining <= 0) break;

    const capacity = p.liquidity_balance;

    const take = Math.min(capacity, remaining);

    if (take > 0) {
      allocations.push({
        pool_id: p.pool_id,
        amount: take
      });

      remaining -= take;
    }
  }

  return {
    requested: demand,
    allocated: demand - remaining,
    remaining,
    allocations
  };
}

module.exports = {
  allocateAcrossPools
};
