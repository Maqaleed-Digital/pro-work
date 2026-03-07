'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');

const { TrustReserveRegistry } = require('../../app/modules/reserve/trust_reserve_registry');
const { evaluateBuffer } = require('../../app/modules/reserve/stability_buffer_engine');
const { evaluateNetworkConfidence } = require('../../app/modules/reserve/network_confidence_oracle');
const { absorbShock } = require('../../app/modules/reserve/reputation_shock_absorber');
const { generateReserveAuditProof } = require('../../app/modules/reserve/reserve_audit_proofs');
const { createReserveRouter } = require('../../app/modules/reserve/reserve_router');

test('reserve registry create lock allocate release lifecycle works', () => {
  const registry = new TrustReserveRegistry();

  const created = registry.createReserve({
    reserve_id: 'resv_1',
    network_id: 'net_global',
    jurisdiction_id: 'ksa',
    reserve_type: 'SYSTEMIC',
    total_balance: 1000
  });

  assert.equal(created.available_balance, 1000);
  assert.equal(created.locked_balance, 0);
  assert.equal(created.allocated_balance, 0);

  const locked = registry.lockFunds('resv_1', 150);
  assert.equal(locked.available_balance, 850);
  assert.equal(locked.locked_balance, 150);

  const unlocked = registry.unlockFunds('resv_1', 50);
  assert.equal(unlocked.available_balance, 900);
  assert.equal(unlocked.locked_balance, 100);

  const allocated = registry.allocateFunds('resv_1', 200);
  assert.equal(allocated.available_balance, 700);
  assert.equal(allocated.allocated_balance, 200);

  const released = registry.releaseAllocation('resv_1', 75);
  assert.equal(released.available_balance, 775);
  assert.equal(released.allocated_balance, 125);

  const events = registry.getEvents();
  assert.ok(events.length >= 5);
});

test('stability buffer engine computes healthy and gap states', () => {
  const result = evaluateBuffer({
    total_exposure: 1000,
    reserve_balance: 1100,
    target_coverage_ratio: 1
  });

  assert.equal(result.required_buffer, 1000);
  assert.equal(result.coverage_ratio, 1.1);
  assert.equal(result.buffer_gap, 0);
  assert.equal(result.health_status, 'HEALTHY');
});

test('network confidence oracle returns deterministic band and actions', () => {
  const result = evaluateNetworkConfidence({
    dispute_rate: 0.1,
    reconciliation_delay: 2,
    reserve_coverage_ratio: 1.2,
    reward_volatility: 0.1,
    jurisdiction_stability_factor: 0.9
  });

  assert.ok(result.confidence_score >= 0 && result.confidence_score <= 100);
  assert.ok(['LOW', 'MEDIUM', 'HIGH'].includes(result.confidence_band));
  assert.ok(Array.isArray(result.contributing_factors));
  assert.ok(Array.isArray(result.recommended_actions));
});

test('reputation shock absorber dampens abnormal shocks', () => {
  const result = absorbShock({
    raw_delta: -50,
    baseline_volatility: 0.2,
    shock_threshold: 20
  });

  assert.equal(result.shock_detected, true);
  assert.ok(['MODERATE', 'SEVERE'].includes(result.severity));
  assert.ok(result.dampening_factor < 1);
  assert.notEqual(result.stabilized_delta, -50);
});

test('reserve audit proofs are deterministic for identical input', () => {
  const input = {
    reserve_id: 'resv_1',
    network_id: 'net_global',
    jurisdiction_id: 'ksa',
    total_balance: 1000,
    available_balance: 700,
    locked_balance: 100,
    allocated_balance: 200,
    utilization_ratio: 0.2,
    reserve_status: 'ACTIVE',
    generated_at: '2026-03-08T00:00:00.000Z'
  };

  const proofA = generateReserveAuditProof(input);
  const proofB = generateReserveAuditProof(input);

  assert.equal(proofA.proof_hash, proofB.proof_hash);
  assert.equal(proofA.proof_type, 'RESERVE_AUDIT_PROOF');
});

test('reserve health endpoint returns healthy response', async () => {
  const router = createReserveRouter();

  const server = http.createServer((req, res) => {
    const handled = router.route(req, res);
    if (!handled) {
      res.statusCode = 404;
      res.end('not found');
    }
  });

  await new Promise((resolve) => server.listen(0, resolve));
  const port = server.address().port;

  const response = await new Promise((resolve, reject) => {
    http.get(`http://127.0.0.1:${port}/reserve/health`, (res) => {
      let body = '';
      res.on('data', (chunk) => {
        body += chunk;
      });
      res.on('end', () => resolve({ statusCode: res.statusCode, body }));
    }).on('error', reject);
  });

  await new Promise((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));

  assert.equal(response.statusCode, 200);
  const parsed = JSON.parse(response.body);
  assert.equal(parsed.ok, true);
  assert.equal(parsed.layer, 'reserve');
});
