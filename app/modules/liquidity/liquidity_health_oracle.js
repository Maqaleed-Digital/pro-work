'use strict';

function evaluateLiquidityHealth(pools) {

  let total = 0;
  let allocated = 0;

  for (const p of pools) {
    total += p.liquidity_balance + p.allocated_liquidity;
    allocated += p.allocated_liquidity;
  }

  const ratio = total === 0 ? 0 : allocated / total;

  let status = 'HEALTHY';

  if (ratio > 0.85) status = 'CRITICAL';
  else if (ratio > 0.65) status = 'WARNING';

  return {
    total_liquidity: total,
    allocated_liquidity: allocated,
    utilization_ratio: ratio,
    status
  };
}

module.exports = {
  evaluateLiquidityHealth
};
