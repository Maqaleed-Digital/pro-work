'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createEventPublisher, InMemoryEventStore, sha256 } = require('../app/modules/event_bus');

function baseEvent(overrides = {}) {
  return {
    event_id: '11111111-1111-1111-1111-111111111111',
    event_type: 'PROJECT_CREATED',
    event_version: '1.0',
    occurred_at: '2026-03-06T12:00:00Z',
    tenant_id: '22222222-2222-2222-2222-222222222222',
    aggregate_type: 'PROJECT',
    aggregate_id: '33333333-3333-3333-3333-333333333333',
    actor: { actor_type: 'HUMAN', actor_id: '44444444-4444-4444-4444-444444444444' },
    correlation_id: '55555555-5555-5555-5555-555555555555',
    causation_id: '66666666-6666-6666-6666-666666666666',
    source: { service: 'execution_engine', module: 'projects', environment: 'test' },
    trust_level: 'STANDARD',
    requires_approval: false,
    payload: { project_id: 'p1', owner_user_id: 'u1', title: 'Alpha', status: 'DISCUSSION' },
    metadata: {},
    ...overrides,
  };
}

test('createEventPublisher throws without eventStore', () => {
  assert.throws(() => createEventPublisher({}), /eventStore with insert/);
});

test('publisher persists a valid registered event', async () => {
  const store = new InMemoryEventStore();
  const publisher = createEventPublisher({ eventStore: store });

  const persisted = await publisher.publish(baseEvent());

  assert.equal(persisted.event_type, 'PROJECT_CREATED');
  assert.ok(persisted.payload_hash, 'payload_hash must be set');
  assert.ok(persisted.envelope_hash, 'envelope_hash must be set');
  assert.ok(persisted.created_at, 'created_at must be set');
  assert.equal((await store.all()).length, 1);
});

test('publisher computes stable payload_hash', async () => {
  const store = new InMemoryEventStore();
  const publisher = createEventPublisher({ eventStore: store });

  const persisted = await publisher.publish(baseEvent());
  // publisher normalizes (key-sorts) before hashing — reconstruct expected from sorted keys
  const canonical = { owner_user_id: 'u1', project_id: 'p1', status: 'DISCUSSION', title: 'Alpha' };
  const expectedHash = sha256(JSON.stringify(canonical));
  assert.equal(persisted.payload_hash, expectedHash);
});

test('publisher rejects missing required payload fields', async () => {
  const store = new InMemoryEventStore();
  const publisher = createEventPublisher({ eventStore: store });

  await assert.rejects(
    () => publisher.publish(baseEvent({ payload: { project_id: 'p1', title: 'Alpha', status: 'DISCUSSION' } })),
    /Missing payload field for PROJECT_CREATED: owner_user_id/
  );
  assert.equal((await store.all()).length, 0);
});

test('publisher rejects unregistered event type', async () => {
  const store = new InMemoryEventStore();
  const publisher = createEventPublisher({ eventStore: store });

  await assert.rejects(
    () => publisher.publish(baseEvent({ event_type: 'UNKNOWN_EVENT', aggregate_type: 'UNKNOWN' })),
    /Unregistered event type/
  );
});

test('publisher rejects aggregate_type mismatch', async () => {
  const store = new InMemoryEventStore();
  const publisher = createEventPublisher({ eventStore: store });

  await assert.rejects(
    () => publisher.publish(baseEvent({ aggregate_type: 'WORKSTREAM' })),
    /aggregate_type mismatch/
  );
});

test('InMemoryEventStore accumulates events', async () => {
  const store = new InMemoryEventStore();
  const publisher = createEventPublisher({ eventStore: store });

  await publisher.publish(baseEvent({ event_id: 'aaa-1' }));
  await publisher.publish(baseEvent({ event_id: 'aaa-2' }));

  const all = await store.all();
  assert.equal(all.length, 2);
});
