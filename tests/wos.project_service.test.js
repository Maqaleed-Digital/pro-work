'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createProjectService, InMemoryProjectStore } = require('../app/modules/wos/project_service');
const { createEventPublisher, InMemoryEventStore } = require('../app/modules/event_bus');
const { createExecutionEventHooks } = require('../app/modules/execution_engine/event_hooks');

function makeService(withHooks = false) {
  const store  = new InMemoryProjectStore();
  let hooks    = null;
  let eventStore = null;
  if (withHooks) {
    eventStore = new InMemoryEventStore();
    const publisher = createEventPublisher({ eventStore });
    hooks = createExecutionEventHooks({ publisher });
  }
  return { svc: createProjectService({ store, hooks }), eventStore };
}

test('createProjectService throws without store', () => {
  assert.throws(() => createProjectService({}), /store is required/);
});

test('create returns project in DISCUSSION status', async () => {
  const { svc } = makeService();
  const p = await svc.create({ tenant_id: 't1', owner_user_id: 'u1', title: 'Alpha Project' });
  assert.ok(p.project_id);
  assert.equal(p.status, 'DISCUSSION');
  assert.equal(p.title, 'Alpha Project');
  assert.equal(p.tenant_id, 't1');
});

test('create trims title', async () => {
  const { svc } = makeService();
  const p = await svc.create({ tenant_id: 't1', owner_user_id: 'u1', title: '  Trimmed  ' });
  assert.equal(p.title, 'Trimmed');
});

test('create rejects missing title', async () => {
  const { svc } = makeService();
  await assert.rejects(() => svc.create({ tenant_id: 't1', owner_user_id: 'u1', title: '' }), { code: 'VALIDATION_ERROR' });
});

test('create rejects missing owner_user_id', async () => {
  const { svc } = makeService();
  await assert.rejects(() => svc.create({ tenant_id: 't1', title: 'X' }), { code: 'VALIDATION_ERROR' });
});

test('create emits PROJECT_CREATED event when hooks provided', async () => {
  const { svc, eventStore } = makeService(true);
  const p = await svc.create({ tenant_id: 't1', owner_user_id: 'u1', title: 'Hooked Project' });
  const events = await eventStore.all();
  assert.equal(events.length, 1);
  assert.equal(events[0].event_type, 'PROJECT_CREATED');
  assert.equal(events[0].payload.project_id, p.project_id);
  assert.equal(events[0].payload.status, 'DISCUSSION');
});

test('create does NOT emit event when no hooks', async () => {
  const eventStore = new InMemoryEventStore();
  const { svc } = makeService(false);
  await svc.create({ tenant_id: 't1', owner_user_id: 'u1', title: 'Silent Project' });
  assert.equal((await eventStore.all()).length, 0);
});

test('get returns project by id', async () => {
  const { svc } = makeService();
  const p = await svc.create({ tenant_id: 't1', owner_user_id: 'u1', title: 'X' });
  const found = await svc.get(p.project_id);
  assert.equal(found.project_id, p.project_id);
});

test('list returns projects for tenant', async () => {
  const { svc } = makeService();
  await svc.create({ tenant_id: 't1', owner_user_id: 'u1', title: 'P1' });
  await svc.create({ tenant_id: 't1', owner_user_id: 'u1', title: 'P2' });
  await svc.create({ tenant_id: 't2', owner_user_id: 'u2', title: 'P3' });
  const t1 = await svc.list('t1');
  assert.equal(t1.length, 2);
});

test('setStatus transitions DISCUSSION → ACTIVE', async () => {
  const { svc } = makeService();
  const p = await svc.create({ tenant_id: 't1', owner_user_id: 'u1', title: 'P1' });
  const updated = await svc.setStatus(p.project_id, 'ACTIVE');
  assert.equal(updated.status, 'ACTIVE');
});

test('setStatus rejects invalid transition DISCUSSION → COMPLETED', async () => {
  const { svc } = makeService();
  const p = await svc.create({ tenant_id: 't1', owner_user_id: 'u1', title: 'P1' });
  await assert.rejects(() => svc.setStatus(p.project_id, 'COMPLETED'), { code: 'INVALID_TRANSITION' });
});

test('setStatus rejects ARCHIVED → ACTIVE', async () => {
  const { svc } = makeService();
  const p = await svc.create({ tenant_id: 't1', owner_user_id: 'u1', title: 'P1' });
  await svc.setStatus(p.project_id, 'ARCHIVED');
  await assert.rejects(() => svc.setStatus(p.project_id, 'ACTIVE'), { code: 'INVALID_TRANSITION' });
});

test('setStatus throws NOT_FOUND for unknown project', async () => {
  const { svc } = makeService();
  await assert.rejects(() => svc.setStatus('bad-id', 'ACTIVE'), { code: 'NOT_FOUND' });
});
