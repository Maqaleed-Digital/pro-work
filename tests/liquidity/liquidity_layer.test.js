'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { LiquidityPoolRegistry } =
require('../../app/modules/liquidity/liquidity_pool_registry');

const { allocateAcrossPools } =
require('../../app/modules/liquidity/liquidity_allocator');

const { evaluateLiquidityHealth } =
require('../../app/modules/liquidity/liquidity_health_oracle');

test('liquidity pool lifecycle works', ()=>{

  const r = new LiquidityPoolRegistry();

  const p = r.createPool({
    pool_id:'pool1',
    network_id:'net',
    reserve_id:'res1',
    liquidity_balance:1000
  });

  assert.equal(p.liquidity_balance,1000);

  const a = r.allocate('pool1',200);

  assert.equal(a.allocated_liquidity,200);

  const rel = r.release('pool1',100);

  assert.equal(rel.liquidity_balance,900);
});

test('allocator distributes demand', ()=>{

  const pools = [
    {pool_id:'a', liquidity_balance:200, utilization_ratio:0.2},
    {pool_id:'b', liquidity_balance:100, utilization_ratio:0.1}
  ];

  const res = allocateAcrossPools(pools,250);

  assert.equal(res.allocated,250);
});

test('liquidity health oracle works', ()=>{

  const pools = [
    {liquidity_balance:100,allocated_liquidity:50},
    {liquidity_balance:200,allocated_liquidity:50}
  ];

  const h = evaluateLiquidityHealth(pools);

  assert.ok(h.total_liquidity > 0);
});
