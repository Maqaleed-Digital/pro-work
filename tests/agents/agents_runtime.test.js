'use strict';
const test = require('node:test');
const assert = require('node:assert');
const runtime = require('../../app/modules/agents/trust_agent_runtime');
const oracle = require('../../app/modules/agents/credential_oracle');
const marketAgent = require('../../app/modules/agents/reputation_market_agent');
const verificationAgent = require('../../app/modules/agents/verification_agent');
const emitSignal = require('../../app/modules/agents/trust_signal_stream');

test('agent runtime starts agent', () => {
  const result = runtime.start('agent1');
  assert.equal(result.status, 'running');
});

test('credential oracle verifies credential', () => {
  const result = oracle({ credential_id: 'cred1' });
  assert.equal(result.oracle_verified, true);
});

test('market agent analyzes signal', () => {
  const result = marketAgent('signal');
  assert.equal(result.market_health, 'stable');
});

test('verification agent returns verified', () => {
  const result = verificationAgent({ credential_id: 'cred1' });
  assert.equal(result.verified, true);
});

test('trust signal emits correct type', () => {
  const signal = emitSignal('TEST', { a: 1 });
  assert.equal(signal.signal_type, 'TEST');
});
