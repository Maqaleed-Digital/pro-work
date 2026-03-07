'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { createOnboardingModule } = require('../app/modules/onboarding');
const { createOnboardingRouter }  = require('../app/api/onboarding_router');

function makeHooks() { return { publish: async () => {} }; }
function makeRouter() {
  const onboarding = createOnboardingModule({ hooks: makeHooks() });
  return createOnboardingRouter({ onboarding });
}

const CASE_ID   = '11111111-1111-1111-1111-111111111111';
const WORKER_ID = '22222222-2222-2222-2222-222222222222';
const TENANT_ID = '33333333-3333-3333-3333-333333333333';

const ACTOR = { actor_type: 'HUMAN', actor_id: '44444444-4444-4444-4444-444444444444' };

describe('OnboardingRouter — start', () => {
  test('POST /onboarding/start → 201', async () => {
    const router = makeRouter();
    const res = await router.handle({
      method: 'POST', path: '/onboarding/start',
      body: {
        onboarding_case_id: CASE_ID, worker_id: WORKER_ID, tenant_id: TENANT_ID,
        event_id: 'ev-1', occurred_at: '2026-03-07T01:00:00Z',
        actor: ACTOR, correlation_id: 'c', causation_id: 'c',
      },
    });
    assert.equal(res.status, 201);
    assert.equal(res.body.onboarding_case_id, CASE_ID);
  });
});

describe('OnboardingRouter — documents', () => {
  test('POST /onboarding/documents → 201', async () => {
    const router = makeRouter();
    const res = await router.handle({
      method: 'POST', path: '/onboarding/documents',
      body: {
        document_id: '55555555-5555-5555-5555-555555555555',
        tenant_id: TENANT_ID, worker_id: WORKER_ID,
        onboarding_case_id: CASE_ID,
        document_type: 'PASSPORT', created_at: '2026-03-07T01:00:00Z',
      },
    });
    assert.equal(res.status, 201);
    assert.equal(res.body.verification_status, 'PENDING');
  });
});

describe('OnboardingRouter — checklists', () => {
  test('POST /onboarding/checklist/items → 201', async () => {
    const router = makeRouter();
    const res = await router.handle({
      method: 'POST', path: '/onboarding/checklist/items',
      body: { checklist_item_id: 'item-1', onboarding_case_id: CASE_ID, title: 'Upload ID', created_at: 'x' },
    });
    assert.equal(res.status, 201);
    assert.equal(res.body.status, 'PENDING');
  });
});

describe('OnboardingRouter — contracts', () => {
  test('POST /onboarding/contracts/draft → 201 in DRAFT', async () => {
    const router = makeRouter();
    const res = await router.handle({
      method: 'POST', path: '/onboarding/contracts/draft',
      body: {
        contract_id: '66666666-6666-6666-6666-666666666666',
        tenant_id: TENANT_ID, worker_id: WORKER_ID, onboarding_case_id: CASE_ID,
        role_title: 'Engineer', wage_base: 10000,
        created_at: '2026-03-07T01:00:00Z', event_id: 'ev-c', occurred_at: '2026-03-07T01:00:00Z',
        actor: ACTOR, correlation_id: 'c', causation_id: 'c',
      },
    });
    assert.equal(res.status, 201);
    assert.equal(res.body.status, 'DRAFT');
  });
});

describe('OnboardingRouter — consents', () => {
  test('POST /onboarding/consents/ack → 201', async () => {
    const router = makeRouter();
    const res = await router.handle({
      method: 'POST', path: '/onboarding/consents/ack',
      body: {
        consent_id: '77777777-7777-7777-7777-777777777777',
        tenant_id: TENANT_ID, worker_id: WORKER_ID, onboarding_case_id: CASE_ID,
        consent_type: 'DATA_PROCESSING', consent_version: '1.0',
        acknowledged_at: '2026-03-07T01:00:00Z',
        event_id: 'ev-consent', occurred_at: '2026-03-07T01:00:00Z',
        actor: ACTOR, correlation_id: 'c', causation_id: 'c',
      },
    });
    assert.equal(res.status, 201);
    assert.equal(res.body.consent_type, 'DATA_PROCESSING');
  });
});

describe('OnboardingRouter — probation', () => {
  test('POST /onboarding/probation/open → 201', async () => {
    const router = makeRouter();
    const res = await router.handle({
      method: 'POST', path: '/onboarding/probation/open',
      body: {
        probation_case_id: '88888888-8888-8888-8888-888888888888',
        tenant_id: TENANT_ID, worker_id: WORKER_ID, onboarding_case_id: CASE_ID,
        started_at: '2026-03-07T01:00:00Z',
      },
    });
    assert.equal(res.status, 201);
    assert.equal(res.body.status, 'ACTIVE');
  });
});

describe('OnboardingRouter — unknown routes', () => {
  test('unknown path returns 404', async () => {
    const router = makeRouter();
    const res = await router.handle({ method: 'GET', path: '/onboarding/unknown', body: {} });
    assert.equal(res.status, 404);
  });
});
