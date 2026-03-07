'use strict';

function evaluateMacroStability(input){

  const inflation = Number(input.trust_inflation || 0);
  const liquidity = Number(input.liquidity_utilization || 0);
  const reserve = Number(input.reserve_coverage || 0);

  let band = "STABLE";

  if(inflation > 0.05) band = "INFLATION_RISK";
  if(liquidity > 0.9) band = "LIQUIDITY_STRESS";
  if(reserve < 1) band = "RESERVE_RISK";

  return {
    trust_inflation: inflation,
    liquidity_utilization: liquidity,
    reserve_coverage: reserve,
    stability_band: band
  };

}

module.exports = {
  evaluateMacroStability
};
