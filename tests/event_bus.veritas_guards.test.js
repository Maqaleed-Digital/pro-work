'use strict';

const test   = require('node:test');
const assert = require('node:assert/strict');
const fs     = require('fs');
const path   = require('path');

const guards     = require('../app/modules/event_bus/veritas/guards');
const transports = require('../app/modules/event_bus/veritas/transport');

const SCHEMA = JSON.parse(
  fs.readFileSync(
    path.join(__dirname, '../app/modules/event_bus/veritas/schema.json'),
    'utf8'
  )
);

function assertMatchesSchema(ev) {
  for (const key of SCHEMA.required) {
    assert.ok(ev[key] !== undefined && ev[key] !== null, `missing required: ${key}`);
  }
  assert.ok(SCHEMA.properties.event_class.enum.includes(ev.event_class));
  assert.ok(SCHEMA.properties.outcome.enum.includes(ev.outcome));
  assert.ok(SCHEMA.properties.mode.enum.includes(ev.mode));
}

test('emitGovernanceException builds a Mode-D divergence_detection event', async () => {
  const t = transports.memoryTransport();
  guards.setTransport(t);

  guards.emitGovernanceException({
    kind:          'execution_boundary',
    guard:         'human_actor',
    fromState:     'DRAFT',
    toState:       'SIGNED',
    contractId:    'k-1',
    tenantId:      'tenant-1',
    actor:         { actor_type: 'AGENT', actor_id: 'a-1' },
    correlationId: 'corr-1',
    causationId:   'cause-1',
  });

  await new Promise(resolve => setImmediate(resolve));
  assert.equal(t.captured.length, 1);
  const ev = t.captured[0];
  assertMatchesSchema(ev);
  assert.equal(ev.mode, 'D');
  assert.equal(ev.event_class, 'divergence_detection');
  assert.equal(ev.outcome, 'blocked');
  assert.equal(ev.severity, 'High'); // outcome=blocked OR event_class=divergence_detection ⇒ High
  assert.equal(ev.payload.wc_event, 'WORKCAPTAIN_GOVERNANCE_EXCEPTION');
  assert.equal(ev.payload.guard, 'human_actor');
  guards.setTransport(null);
});

test('emit failures are swallowed — caller never sees them', () => {
  guards.setTransport({
    publish() { throw new Error('transport boom'); },
  });
  // Must not throw, must return undefined immediately.
  const out = guards.emitGovernanceException({
    kind: 'policy', guard: 'terminal_state',
    fromState: 'TERMINATED', toState: 'AMENDED',
    contractId: 'k-2', tenantId: 't',
    actor: { actor_type: 'HUMAN', actor_id: 'h' },
  });
  assert.equal(out, undefined);
  guards.setTransport(null);
});

test('async transport rejection is swallowed', async () => {
  guards.setTransport({
    publish() { return Promise.reject(new Error('async boom')); },
  });
  // Should not produce an unhandled rejection.
  guards.emitGovernanceException({
    kind: 'policy', guard: 'invalid_transition',
    fromState: 'DRAFT', toState: 'TERMINATED',
    contractId: 'k-3', tenantId: 't',
    actor: { actor_type: 'HUMAN', actor_id: 'h' },
  });
  await new Promise(resolve => setImmediate(resolve));
  guards.setTransport(null);
});

test('default transport is no-op (zero behaviour change without wiring)', () => {
  // After setTransport(null), the module falls back to noopTransport.
  guards.setTransport(null);
  // Must not throw.
  guards.emitGovernanceException({
    kind: 'execution_boundary', guard: 'human_actor',
    fromState: 'DRAFT', toState: 'SIGNED',
    contractId: 'k-4', tenantId: 't',
    actor: null,
  });
});

test('contract_state_machine throws are preserved (behaviour-preserving emit)', async () => {
  // Simulate the integration: pre-throw emit followed by the original throw.
  // The original error's name and message must be untouched.
  const t = transports.memoryTransport();
  guards.setTransport(t);

  let caught;
  try {
    guards.emitGovernanceException({
      kind: 'execution_boundary', guard: 'human_actor',
      fromState: 'DRAFT', toState: 'SIGNED',
      contractId: 'k-5', tenantId: 't',
      actor: { actor_type: 'AGENT', actor_id: 'a' },
    });
    const err = new Error('DRAFT→SIGNED requires HUMAN actor — auto-transitions are not permitted');
    err.name = 'ContractTransitionError';
    throw err;
  } catch (e) {
    caught = e;
  }
  await new Promise(resolve => setImmediate(resolve));

  assert.equal(caught.name, 'ContractTransitionError');
  assert.match(caught.message, /requires HUMAN actor/);
  assert.equal(t.captured.length, 1);
  guards.setTransport(null);
});
