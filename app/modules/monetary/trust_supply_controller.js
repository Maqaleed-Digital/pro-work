'use strict';

function evaluateSupply(input){

  const current = Number(input.current_supply || 0);
  const growth = Number(input.liquidity_growth || 0);
  const cap = Number(input.liquidity_growth_cap || 0.15);

  let status = "STABLE";

  if(growth > cap) status = "OVER_EXPANSION";
  if(growth < 0) status = "CONTRACTION";

  return {
    current_supply: current,
    liquidity_growth: growth,
    growth_cap: cap,
    status
  };

}

module.exports = {
  evaluateSupply
};
