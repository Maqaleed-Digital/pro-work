'use strict';
const test = require('node:test');
const assert = require('node:assert');
const updateMarket = require('../../app/modules/economy/reputation_market_engine');
const stakingRegistry = require('../../app/modules/economy/credential_staking_registry');
const exchangeScore = require('../../app/modules/economy/trust_score_exchange');
const skillRegistry = require('../../app/modules/economy/verified_skill_registry');
const liquidityPool = require('../../app/modules/economy/reputation_liquidity_pool');

test('reputation market update returns credential id', () => {
  const result = updateMarket({ credential_id: 'cred-1', score: 50 });
  assert.equal(result.credential_id, 'cred-1');
});

test('staking registry stores stake amount', () => {
  stakingRegistry.stake('cred-1', 100);
  assert.equal(stakingRegistry.getStake('cred-1'), 100);
});

test('trust score exchange returns transferred amount', () => {
  const result = exchangeScore('userA', 'userB', 10);
  assert.equal(result.transferred_score, 10);
});

test('verified skill registry stores skills', () => {
  skillRegistry.register('user1', 'nodejs');
  const skills = skillRegistry.getSkills('user1');
  assert.equal(skills.length, 1);
});

test('liquidity pool creates pool', () => {
  const pool = liquidityPool.create('poolA', 1000);
  assert.equal(pool.pool_id, 'poolA');
});
