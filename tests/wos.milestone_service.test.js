'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createMilestoneService, InMemoryMilestoneStore } = require('../app/modules/wos/milestone_service');
const { createTrustConsumer, InMemoryLedgerStore } = require('../app/modules/trust_engine/trust_consumer');
const { createEventPublisher, InMemoryEventStore } = require('../app/modules/event_bus');
const { createExecutionEventHooks } = require('../app/modules/execution_engine/event_hooks');

function makeStack() {
  const eventStore   = new InMemoryEventStore();
  const ledgerStore  = new InMemoryLedgerStore();
  const publisher    = createEventPublisher({ eventStore });
  const hooks        = createExecutionEventHooks({ publisher });
  const consumer     = createTrustConsumer({ ledgerStore });
  const svc          = createMilestoneService({ store: new InMemoryMilestoneStore(), hooks });
  return { eventStore, ledgerStore, consumer, svc };
}

const MILESTONE_ARGS = {
  tenant_id: 't1', workstream_id: 'ws-1', project_id: 'proj-1',
  title: 'MVP Release', created_by: 'u1',
};

test('createMilestoneService throws without store', () => {
  assert.throws(() => createMilestoneService({}), /store is required/);
});

test('create returns milestone in OPEN status', async () => {
  const { svc } = makeStack();
  const m = await svc.create(MILESTONE_ARGS);
  assert.ok(m.milestone_id);
  assert.equal(m.status, 'OPEN');
  assert.equal(m.title, 'MVP Release');
  assert.equal(m.completed_at, null);
});

test('create emits MILESTONE_CREATED event', async () => {
  const { svc, eventStore } = makeStack();
  await svc.create(MILESTONE_ARGS);
  const events = await eventStore.all();
  const e = events.find(ev => ev.event_type === 'MILESTONE_CREATED');
  assert.ok(e, 'MILESTONE_CREATED event must exist');
  assert.equal(e.trust_level, 'STANDARD');
});

test('create rejects missing title', async () => {
  const { svc } = makeStack();
  await assert.rejects(() => svc.create({ ...MILESTONE_ARGS, title: '' }), { code: 'VALIDATION_ERROR' });
});

test('create rejects missing workstream_id', async () => {
  const { svc } = makeStack();
  await assert.rejects(() => svc.create({ ...MILESTONE_ARGS, workstream_id: undefined }), { code: 'VALIDATION_ERROR' });
});

test('advance transitions OPEN → IN_PROGRESS', async () => {
  const { svc } = makeStack();
  const m = await svc.create(MILESTONE_ARGS);
  const updated = await svc.advance(m.milestone_id);
  assert.equal(updated.status, 'IN_PROGRESS');
});

test('advance throws on already COMPLETED milestone', async () => {
  const { svc } = makeStack();
  const m = await svc.create(MILESTONE_ARGS);
  await svc.advance(m.milestone_id);
  await svc.complete(m.milestone_id, {
    approval_record_id: 'apr-1', evidence_pack_id: 'ep-1',
    completed_by_actor_type: 'HUMAN', completed_by_actor_id: 'u1',
  });
  await assert.rejects(() => svc.advance(m.milestone_id), { code: 'PRECONDITION_FAILED' });
});

test('complete sets status to COMPLETED and records completed_at', async () => {
  const { svc } = makeStack();
  const m = await svc.create(MILESTONE_ARGS);
  const completed = await svc.complete(m.milestone_id, {
    approval_record_id: 'apr-1', evidence_pack_id: 'ep-1',
    completed_by_actor_type: 'HUMAN', completed_by_actor_id: 'u1',
  });
  assert.equal(completed.status, 'COMPLETED');
  assert.ok(completed.completed_at, 'completed_at must be set');
});

test('complete emits MILESTONE_COMPLETED with HIGH trust level', async () => {
  const { svc, eventStore } = makeStack();
  const m = await svc.create(MILESTONE_ARGS);
  await svc.complete(m.milestone_id, {
    approval_record_id: 'apr-1', evidence_pack_id: 'ep-1',
    completed_by_actor_type: 'HUMAN', completed_by_actor_id: 'u1',
  });
  const events = await eventStore.all();
  const e = events.find(ev => ev.event_type === 'MILESTONE_COMPLETED');
  assert.ok(e, 'MILESTONE_COMPLETED event must exist');
  assert.equal(e.trust_level, 'HIGH');
  assert.equal(e.payload.milestone_id, m.milestone_id);
  assert.equal(e.payload.approval_record_id, 'apr-1');
  assert.equal(e.payload.evidence_pack_id, 'ep-1');
});

test('MILESTONE_COMPLETED event is processed into trust ledger', async () => {
  const { svc, eventStore, ledgerStore, consumer } = makeStack();
  const m = await svc.create(MILESTONE_ARGS);
  await svc.complete(m.milestone_id, {
    approval_record_id: 'apr-1', evidence_pack_id: 'ep-1',
    completed_by_actor_type: 'HUMAN', completed_by_actor_id: 'u1',
  });
  const events = await eventStore.all();
  const completedEvent = events.find(e => e.event_type === 'MILESTONE_COMPLETED');
  const result = await consumer.process(completedEvent);
  assert.equal(result.processed, true);
  assert.ok(result.entry_hash);
  const ledger = await ledgerStore.all();
  assert.equal(ledger.length, 1);
  assert.equal(ledger[0].action_type, 'MILESTONE_COMPLETED');
});

test('complete is idempotency-safe — second call throws PRECONDITION_FAILED', async () => {
  const { svc } = makeStack();
  const m = await svc.create(MILESTONE_ARGS);
  await svc.complete(m.milestone_id, {
    approval_record_id: 'apr-1', evidence_pack_id: 'ep-1',
    completed_by_actor_type: 'HUMAN', completed_by_actor_id: 'u1',
  });
  await assert.rejects(() => svc.complete(m.milestone_id, {}), { code: 'PRECONDITION_FAILED' });
});

test('complete throws NOT_FOUND for unknown milestone', async () => {
  const { svc } = makeStack();
  await assert.rejects(() => svc.complete('bad-id', {}), { code: 'NOT_FOUND' });
});
