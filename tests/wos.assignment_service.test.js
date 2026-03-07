'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createAssignmentService, InMemoryAssignmentStore } = require('../app/modules/wos/assignment_service');
const { createWorkerService, InMemoryWorkerStore } = require('../app/modules/wos/worker_service');
const { createPodService, InMemoryPodStore } = require('../app/modules/wos/pod_service');

function makeStack(podCapacity = 10) {
  const workerSvc = createWorkerService({ store: new InMemoryWorkerStore() });
  const podSvc    = createPodService({ store: new InMemoryPodStore() });
  const asnSvc    = createAssignmentService({
    store: new InMemoryAssignmentStore(),
    workerService: workerSvc,
    podService: podSvc,
  });
  return { workerSvc, podSvc, asnSvc };
}

test('createAssignmentService throws without store', () => {
  assert.throws(() => createAssignmentService({}), /store is required/);
});

test('create assigns an active worker to an active pod', async () => {
  const { workerSvc, podSvc, asnSvc } = makeStack();
  const w = await workerSvc.create({ tenant_id: 't1', type: 'FTE', display_name: 'Alice' });
  const p = await podSvc.create({ tenant_id: 't1', name: 'Team Alpha' });
  const a = await asnSvc.create({ tenant_id: 't1', worker_id: w.worker_id, pod_id: p.pod_id });
  assert.ok(a.assignment_id);
  assert.equal(a.state, 'ACTIVE');
  assert.equal(a.worker_id, w.worker_id);
  assert.equal(a.pod_id, p.pod_id);
  assert.equal(a.role, 'member');
});

test('create side-effects: worker.assigned_pod is set', async () => {
  const { workerSvc, podSvc, asnSvc } = makeStack();
  const w = await workerSvc.create({ tenant_id: 't1', type: 'FTE', display_name: 'Alice' });
  const p = await podSvc.create({ tenant_id: 't1', name: 'Team Alpha' });
  await asnSvc.create({ tenant_id: 't1', worker_id: w.worker_id, pod_id: p.pod_id });
  const updated = await workerSvc.get(w.worker_id);
  assert.ok(updated.assigned_pod);
  assert.equal(updated.assigned_pod.pod_id, p.pod_id);
});

test('create rejects INACTIVE worker', async () => {
  const { workerSvc, podSvc, asnSvc } = makeStack();
  const w = await workerSvc.create({ tenant_id: 't1', type: 'FTE', display_name: 'Alice' });
  await workerSvc.setStatus(w.worker_id, 'INACTIVE');
  const p = await podSvc.create({ tenant_id: 't1', name: 'Team Alpha' });
  await assert.rejects(() => asnSvc.create({ tenant_id: 't1', worker_id: w.worker_id, pod_id: p.pod_id }), { code: 'PRECONDITION_FAILED' });
});

test('create rejects already-assigned worker', async () => {
  const { workerSvc, podSvc, asnSvc } = makeStack();
  const w  = await workerSvc.create({ tenant_id: 't1', type: 'FTE', display_name: 'Alice' });
  const p1 = await podSvc.create({ tenant_id: 't1', name: 'Team A' });
  const p2 = await podSvc.create({ tenant_id: 't1', name: 'Team B' });
  await asnSvc.create({ tenant_id: 't1', worker_id: w.worker_id, pod_id: p1.pod_id });
  await assert.rejects(() => asnSvc.create({ tenant_id: 't1', worker_id: w.worker_id, pod_id: p2.pod_id }), { code: 'ALREADY_ASSIGNED' });
});

test('create rejects pod at capacity', async () => {
  const { workerSvc, podSvc, asnSvc } = makeStack();
  const p = await podSvc.create({ tenant_id: 't1', name: 'Small Pod', capacity: { max_workers: 1 } });
  const w1 = await workerSvc.create({ tenant_id: 't1', type: 'FTE', display_name: 'Alice' });
  const w2 = await workerSvc.create({ tenant_id: 't1', type: 'FTE', display_name: 'Bob' });
  await asnSvc.create({ tenant_id: 't1', worker_id: w1.worker_id, pod_id: p.pod_id });
  await assert.rejects(() => asnSvc.create({ tenant_id: 't1', worker_id: w2.worker_id, pod_id: p.pod_id }), { code: 'CAPACITY_EXCEEDED' });
});

test('deactivate sets state to INACTIVE and clears worker assigned_pod', async () => {
  const { workerSvc, podSvc, asnSvc } = makeStack();
  const w = await workerSvc.create({ tenant_id: 't1', type: 'FTE', display_name: 'Alice' });
  const p = await podSvc.create({ tenant_id: 't1', name: 'Team Alpha' });
  const a = await asnSvc.create({ tenant_id: 't1', worker_id: w.worker_id, pod_id: p.pod_id });
  const deactivated = await asnSvc.deactivate(a.assignment_id);
  assert.equal(deactivated.state, 'INACTIVE');
  const w2 = await workerSvc.get(w.worker_id);
  assert.equal(w2.assigned_pod, null);
});

test('deactivate throws PRECONDITION_FAILED for already inactive assignment', async () => {
  const { workerSvc, podSvc, asnSvc } = makeStack();
  const w = await workerSvc.create({ tenant_id: 't1', type: 'FTE', display_name: 'Alice' });
  const p = await podSvc.create({ tenant_id: 't1', name: 'Team Alpha' });
  const a = await asnSvc.create({ tenant_id: 't1', worker_id: w.worker_id, pod_id: p.pod_id });
  await asnSvc.deactivate(a.assignment_id);
  await assert.rejects(() => asnSvc.deactivate(a.assignment_id), { code: 'PRECONDITION_FAILED' });
});

test('deactivate throws NOT_FOUND for unknown assignment', async () => {
  const { asnSvc } = makeStack();
  await assert.rejects(() => asnSvc.deactivate('bad-id'), { code: 'NOT_FOUND' });
});

test('list returns assignments for tenant', async () => {
  const { workerSvc, podSvc, asnSvc } = makeStack();
  const w1 = await workerSvc.create({ tenant_id: 't1', type: 'FTE', display_name: 'Alice' });
  const w2 = await workerSvc.create({ tenant_id: 't1', type: 'FTE', display_name: 'Bob' });
  const p  = await podSvc.create({ tenant_id: 't1', name: 'Team Alpha' });
  await asnSvc.create({ tenant_id: 't1', worker_id: w1.worker_id, pod_id: p.pod_id });
  await asnSvc.create({ tenant_id: 't1', worker_id: w2.worker_id, pod_id: p.pod_id });
  const list = await asnSvc.list('t1');
  assert.equal(list.length, 2);
});
