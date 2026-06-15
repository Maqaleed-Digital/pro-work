'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createLifecycleService, InMemoryLifecycleStore } = require('../app/modules/lifecycle/lifecycle_service');

function hooks() {
  const events = [];
  return { events, publish: async (e) => events.push(e) };
}

test('changeWorkerStatus emits WORKER_STATUS_CHANGED', async () => {
  const h = hooks();
  const svc = createLifecycleService({ store: new InMemoryLifecycleStore(), hooks: h });
  const out = await svc.changeWorkerStatus({
    tenant_id: 't1',
    worker_id: 'w1',
    next_status: 'ACTIVE'
  });
  assert.equal(out.current_status, 'ACTIVE');
  assert.equal(h.events[0].event_type, 'WORKER_STATUS_CHANGED');
});

test('raiseAlert emits LIFECYCLE_ALERT_RAISED', async () => {
  const h = hooks();
  const svc = createLifecycleService({ store: new InMemoryLifecycleStore(), hooks: h });
  const out = await svc.raiseAlert({
    tenant_id: 't1',
    worker_id: 'w1',
    alert_code: 'DOC_EXPIRING'
  });
  assert.equal(out.alert_code, 'DOC_EXPIRING');
  assert.equal(h.events[0].event_type, 'LIFECYCLE_ALERT_RAISED');
});
