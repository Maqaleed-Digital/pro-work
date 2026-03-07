'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createWorkerService, InMemoryWorkerStore } = require('../app/modules/wos/worker_service');

function makeService() {
  return createWorkerService({ store: new InMemoryWorkerStore() });
}

test('createWorkerService throws without store', () => {
  assert.throws(() => createWorkerService({}), /store is required/);
});

test('create returns a valid FTE worker', async () => {
  const svc = makeService();
  const w = await svc.create({ tenant_id: 't1', type: 'FTE', display_name: 'Alice' });
  assert.ok(w.worker_id);
  assert.equal(w.type, 'FTE');
  assert.equal(w.status, 'ACTIVE');
  assert.equal(w.assigned_pod, null);
  assert.deepEqual(w.skills, []);
});

test('create returns a valid FREELANCER worker', async () => {
  const svc = makeService();
  const w = await svc.create({ tenant_id: 't1', type: 'FREELANCER', display_name: 'Bob', skills: ['Node.js', 'SQL'] });
  assert.equal(w.type, 'FREELANCER');
  assert.deepEqual(w.skills, ['Node.js', 'SQL']);
});

test('create rejects invalid type', async () => {
  const svc = makeService();
  await assert.rejects(() => svc.create({ tenant_id: 't1', type: 'ROBOT', display_name: 'X' }), { code: 'INVALID_TYPE' });
});

test('create rejects missing display_name', async () => {
  const svc = makeService();
  await assert.rejects(() => svc.create({ tenant_id: 't1', type: 'FTE', display_name: '' }), { code: 'VALIDATION_ERROR' });
});

test('get returns worker by id', async () => {
  const svc = makeService();
  const w = await svc.create({ tenant_id: 't1', type: 'FTE', display_name: 'Alice' });
  const found = await svc.get(w.worker_id);
  assert.equal(found.worker_id, w.worker_id);
});

test('get returns null for unknown id', async () => {
  const svc = makeService();
  assert.equal(await svc.get('nonexistent'), null);
});

test('list returns workers for tenant', async () => {
  const svc = makeService();
  await svc.create({ tenant_id: 't1', type: 'FTE', display_name: 'Alice' });
  await svc.create({ tenant_id: 't2', type: 'FTE', display_name: 'Bob' });
  const t1 = await svc.list('t1');
  assert.equal(t1.length, 1);
  assert.equal(t1[0].display_name, 'Alice');
});

test('setStatus transitions ACTIVE → INACTIVE', async () => {
  const svc = makeService();
  const w = await svc.create({ tenant_id: 't1', type: 'FTE', display_name: 'Alice' });
  const updated = await svc.setStatus(w.worker_id, 'INACTIVE');
  assert.equal(updated.status, 'INACTIVE');
});

test('setStatus rejects invalid transition INACTIVE → SUSPENDED', async () => {
  const svc = makeService();
  const w = await svc.create({ tenant_id: 't1', type: 'FTE', display_name: 'Alice' });
  await svc.setStatus(w.worker_id, 'INACTIVE');
  await assert.rejects(() => svc.setStatus(w.worker_id, 'SUSPENDED'), { code: 'INVALID_TRANSITION' });
});

test('setStatus rejects invalid status string', async () => {
  const svc = makeService();
  const w = await svc.create({ tenant_id: 't1', type: 'FTE', display_name: 'Alice' });
  await assert.rejects(() => svc.setStatus(w.worker_id, 'ZOMBIE'), { code: 'INVALID_STATUS' });
});

test('setStatus throws NOT_FOUND for unknown worker', async () => {
  const svc = makeService();
  await assert.rejects(() => svc.setStatus('bad-id', 'INACTIVE'), { code: 'NOT_FOUND' });
});

test('patch updates allowed fields', async () => {
  const svc = makeService();
  const w = await svc.create({ tenant_id: 't1', type: 'FTE', display_name: 'Alice' });
  const updated = await svc.patch(w.worker_id, { display_name: 'Alice B.', skills: ['Go'] });
  assert.equal(updated.display_name, 'Alice B.');
  assert.deepEqual(updated.skills, ['Go']);
});

test('patch throws NOT_FOUND for unknown worker', async () => {
  const svc = makeService();
  await assert.rejects(() => svc.patch('bad-id', { display_name: 'X' }), { code: 'NOT_FOUND' });
});

test('assignPod and unassignPod round-trip', async () => {
  const svc = makeService();
  const w = await svc.create({ tenant_id: 't1', type: 'FTE', display_name: 'Alice' });
  const assigned = await svc.assignPod(w.worker_id, { pod_id: 'pod-1', role: 'member', assignment_id: 'asn-1' });
  assert.deepEqual(assigned.assigned_pod, { pod_id: 'pod-1', role: 'member', assignment_id: 'asn-1' });
  const unassigned = await svc.unassignPod(w.worker_id);
  assert.equal(unassigned.assigned_pod, null);
});
