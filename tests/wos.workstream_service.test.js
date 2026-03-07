'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createWorkstreamService, InMemoryWorkstreamStore } = require('../app/modules/wos/workstream_service');
const { createProjectService, InMemoryProjectStore } = require('../app/modules/wos/project_service');
const { createEventPublisher, InMemoryEventStore } = require('../app/modules/event_bus');
const { createExecutionEventHooks } = require('../app/modules/execution_engine/event_hooks');

function makeStack() {
  const eventStore  = new InMemoryEventStore();
  const publisher   = createEventPublisher({ eventStore });
  const hooks       = createExecutionEventHooks({ publisher });
  const projectSvc  = createProjectService({ store: new InMemoryProjectStore(), hooks });
  const wsSvc       = createWorkstreamService({ store: new InMemoryWorkstreamStore(), hooks, projectService: projectSvc });
  return { eventStore, projectSvc, wsSvc };
}

test('createWorkstreamService throws without store', () => {
  assert.throws(() => createWorkstreamService({}), /store is required/);
});

test('create returns workstream linked to project', async () => {
  const { projectSvc, wsSvc } = makeStack();
  const p  = await projectSvc.create({ tenant_id: 't1', owner_user_id: 'u1', title: 'P1' });
  const ws = await wsSvc.create({ tenant_id: 't1', project_id: p.project_id, stream_name: 'Dev', created_by: 'u1' });
  assert.ok(ws.workstream_id);
  assert.equal(ws.project_id, p.project_id);
  assert.equal(ws.status, 'ACTIVE');
  assert.equal(ws.stream_name, 'Dev');
});

test('create emits WORKSTREAM_CREATED event', async () => {
  const { eventStore, projectSvc, wsSvc } = makeStack();
  const p = await projectSvc.create({ tenant_id: 't1', owner_user_id: 'u1', title: 'P1' });
  await wsSvc.create({ tenant_id: 't1', project_id: p.project_id, stream_name: 'Stream A', created_by: 'u1' });
  const events = await eventStore.all();
  const wsEvent = events.find(e => e.event_type === 'WORKSTREAM_CREATED');
  assert.ok(wsEvent, 'WORKSTREAM_CREATED event must exist');
  assert.equal(wsEvent.payload.project_id, p.project_id);
});

test('create rejects missing stream_name', async () => {
  const { projectSvc, wsSvc } = makeStack();
  const p = await projectSvc.create({ tenant_id: 't1', owner_user_id: 'u1', title: 'P1' });
  await assert.rejects(
    () => wsSvc.create({ tenant_id: 't1', project_id: p.project_id, stream_name: '', created_by: 'u1' }),
    { code: 'VALIDATION_ERROR' }
  );
});

test('create rejects missing created_by', async () => {
  const { projectSvc, wsSvc } = makeStack();
  const p = await projectSvc.create({ tenant_id: 't1', owner_user_id: 'u1', title: 'P1' });
  await assert.rejects(
    () => wsSvc.create({ tenant_id: 't1', project_id: p.project_id, stream_name: 'S' }),
    { code: 'VALIDATION_ERROR' }
  );
});

test('create rejects workstream for ARCHIVED project', async () => {
  const { projectSvc, wsSvc } = makeStack();
  const p = await projectSvc.create({ tenant_id: 't1', owner_user_id: 'u1', title: 'P1' });
  await projectSvc.setStatus(p.project_id, 'ARCHIVED');
  await assert.rejects(
    () => wsSvc.create({ tenant_id: 't1', project_id: p.project_id, stream_name: 'S', created_by: 'u1' }),
    { code: 'PRECONDITION_FAILED' }
  );
});

test('create rejects unknown project_id', async () => {
  const { wsSvc } = makeStack();
  await assert.rejects(
    () => wsSvc.create({ tenant_id: 't1', project_id: 'bad-id', stream_name: 'S', created_by: 'u1' }),
    { code: 'NOT_FOUND' }
  );
});

test('list filters by project_id', async () => {
  const { projectSvc, wsSvc } = makeStack();
  const p1 = await projectSvc.create({ tenant_id: 't1', owner_user_id: 'u1', title: 'P1' });
  const p2 = await projectSvc.create({ tenant_id: 't1', owner_user_id: 'u1', title: 'P2' });
  await wsSvc.create({ tenant_id: 't1', project_id: p1.project_id, stream_name: 'S1', created_by: 'u1' });
  await wsSvc.create({ tenant_id: 't1', project_id: p2.project_id, stream_name: 'S2', created_by: 'u1' });
  const p1streams = await wsSvc.list('t1', p1.project_id);
  assert.equal(p1streams.length, 1);
  assert.equal(p1streams[0].stream_name, 'S1');
});

test('setStatus transitions to PAUSED', async () => {
  const { projectSvc, wsSvc } = makeStack();
  const p  = await projectSvc.create({ tenant_id: 't1', owner_user_id: 'u1', title: 'P1' });
  const ws = await wsSvc.create({ tenant_id: 't1', project_id: p.project_id, stream_name: 'S', created_by: 'u1' });
  const updated = await wsSvc.setStatus(ws.workstream_id, 'PAUSED');
  assert.equal(updated.status, 'PAUSED');
});
