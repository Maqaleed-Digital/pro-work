'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { MonetaryPolicyRegistry } =
require('../../app/modules/monetary/monetary_policy_registry');

const { evaluateSupply } =
require('../../app/modules/monetary/trust_supply_controller');

const { throttleLiquidity } =
require('../../app/modules/monetary/liquidity_throttle_engine');

const { evaluateMacroStability } =
require('../../app/modules/monetary/macro_stability_oracle');

test("monetary policy registry works",()=>{

  const r = new MonetaryPolicyRegistry();

  const p = r.registerPolicy({policy_id:"p1"});

  assert.equal(p.policy_id,"p1");

});

test("trust supply controller evaluates growth",()=>{

  const r = evaluateSupply({
    current_supply:1000,
    liquidity_growth:0.2,
    liquidity_growth_cap:0.15
  });

  assert.equal(r.status,"OVER_EXPANSION");

});

test("liquidity throttle works",()=>{

  const r = throttleLiquidity({
    utilization_ratio:0.92
  });

  assert.equal(r.throttle_factor,0.5);

});

test("macro stability oracle returns band",()=>{

  const r = evaluateMacroStability({
    trust_inflation:0.07,
    liquidity_utilization:0.6,
    reserve_coverage:1.2
  });

  assert.equal(r.stability_band,"INFLATION_RISK");

});
