'use strict';

function throttleLiquidity(input){

  const utilization = Number(input.utilization_ratio || 0);
  let throttle = 1;

  if(utilization > 0.9) throttle = 0.5;
  else if(utilization > 0.75) throttle = 0.75;

  return {
    utilization_ratio: utilization,
    throttle_factor: throttle
  };
}

module.exports = {
  throttleLiquidity
};
