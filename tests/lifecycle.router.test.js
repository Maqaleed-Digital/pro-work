'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createLifecycleModule } = require('../app/modules/lifecycle');
const { createLifecycleRouter } = require('../app/api/lifecycle_router');

function hooks() {
  return { publish: async () => {} };
}

test('router initiates offboarding', async () => {
  const lifecycle = createLifecycleModule({ hooks: hooks() });
  const router = createLifecycleRouter({ lifecycle });
  const res = await router.handle({
    method: 'POST',
    path: '/offboarding/initiate',
    body: {
      tenant_id: 't1',
      offboarding_case_id: 'o1',
      worker_id: 'w1'
    }
  });
  assert.equal(res.status, 201);
  assert.equal(res.body.status, 'INITIATED');
});
