'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createTrustConsumer, InMemoryLedgerStore } = require('../app/modules/trust_engine/trust_consumer');
const { computePayloadDigest, computeLedgerEntryHash } = require('../app/modules/trust_engine/ledger_hash');

function baseEvent(overrides = {}) {
  return {
    event_id: '11111111-1111-1111-1111-111111111111',
    event_type: 'MILESTONE_COMPLETED',
    event_version: '1.0',
    occurred_at: '2026-03-06T12:00:00Z',
    tenant_id: '22222222-2222-2222-2222-222222222222',
    aggregate_type: 'MILESTONE',
    aggregate_id: '33333333-3333-3333-3333-333333333333',
    actor: { actor_type: 'HUMAN', actor_id: '44444444-4444-4444-4444-444444444444' },
    correlation_id: '55555555-5555-5555-5555-555555555555',
    causation_id: '66666666-6666-6666-6666-666666666666',
    source: { service: 'execution_engine', module: 'milestones', environment: 'test' },
    trust_level: 'HIGH',
    requires_approval: false,
    payload: {
      milestone_id: '33333333-3333-3333-3333-333333333333',
      workstream_id: '77777777-7777-7777-7777-777777777777',
      project_id: '88888888-8888-8888-8888-888888888888',
      completed_by_actor_type: 'HUMAN',
      completed_by_actor_id: '44444444-4444-4444-4444-444444444444',
      approval_record_id: '99999999-9999-9999-9999-999999999999',
      evidence_pack_id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    },
    metadata: {},
    ...overrides,
  };
}

test('createTrustConsumer throws without valid ledgerStore', () => {
  assert.throws(() => createTrustConsumer({}), /ledgerStore with getLastHash/);
});

test('trust consumer appends a ledger entry for trust-sensitive events', async () => {
  const ledgerStore = new InMemoryLedgerStore();
  const consumer = createTrustConsumer({ ledgerStore });

  const result = await consumer.process(baseEvent());

  assert.equal(result.processed, true);
  assert.ok(result.ledger_entry_id, 'ledger_entry_id must be set');
  assert.ok(result.entry_hash, 'entry_hash must be set');
  assert.equal(result.prev_hash, null, 'first entry prev_hash must be null');
  assert.equal((await ledgerStore.all()).length, 1);
});

test('trust consumer skips non-trust-sensitive events', async () => {
  const ledgerStore = new InMemoryLedgerStore();
  const consumer = createTrustConsumer({ ledgerStore });

  const result = await consumer.process(baseEvent({
    event_type: 'PROJECT_CREATED',
    aggregate_type: 'PROJECT',
    trust_level: 'STANDARD',
    payload: { project_id: 'p1', owner_user_id: 'u1', title: 'T', status: 'DISCUSSION' },
  }));

  assert.equal(result.processed, false);
  assert.equal(result.reason, 'not_trust_sensitive');
  assert.equal((await ledgerStore.all()).length, 0);
});

test('trust consumer chains entry_hash correctly', async () => {
  const ledgerStore = new InMemoryLedgerStore();
  const consumer = createTrustConsumer({ ledgerStore });

  const r1 = await consumer.process(baseEvent({ event_id: 'ev-001' }));
  const r2 = await consumer.process(baseEvent({ event_id: 'ev-002' }));

  assert.equal(r2.prev_hash, r1.entry_hash, 'second entry prev_hash must equal first entry_hash');
  assert.equal((await ledgerStore.all()).length, 2);
});

test('trust consumer computes deterministic payload_digest', async () => {
  const ledgerStore = new InMemoryLedgerStore();
  const consumer = createTrustConsumer({ ledgerStore });
  const event = baseEvent();

  const result = await consumer.process(event);
  const expectedDigest = computePayloadDigest(event.payload);

  assert.equal(result.payload_digest, expectedDigest);
});

test('trust consumer entry_hash is deterministic', async () => {
  const event = baseEvent();
  const payload_digest = computePayloadDigest(event.payload);
  const expectedHash = computeLedgerEntryHash({
    event_id: event.event_id,
    event_type: event.event_type,
    aggregate_id: event.aggregate_id,
    payload_digest,
    prev_hash: null,
  });

  const ledgerStore = new InMemoryLedgerStore();
  const consumer = createTrustConsumer({ ledgerStore });
  const result = await consumer.process(event);

  assert.equal(result.entry_hash, expectedHash);
});

test('trust consumer rejects unregistered event type', async () => {
  const ledgerStore = new InMemoryLedgerStore();
  const consumer = createTrustConsumer({ ledgerStore });

  await assert.rejects(
    () => consumer.process(baseEvent({ event_type: 'UNKNOWN_EVT', aggregate_type: 'X' })),
    /Unregistered event type/
  );
});
