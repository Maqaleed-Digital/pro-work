'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { createHiringModule } = require('../app/modules/hiring');
const { createHiringRouter }  = require('../app/api/hiring_router');

function makeHooks() { return { publish: async () => {} }; }
function makeRouter() {
  const hiring = createHiringModule({ hooks: makeHooks() });
  return createHiringRouter({ hiring });
}

const TENANT_ID = '22222222-2222-2222-2222-222222222222';
const ACTOR     = { actor_type: 'HUMAN', actor_id: '44444444-4444-4444-4444-444444444444' };

describe('HiringRouter — compensation', () => {
  test('POST /hiring/compensation/draft → 201 DRAFT', async () => {
    const router = makeRouter();
    const res = await router.handle({
      method: 'POST', path: '/hiring/compensation/draft',
      body: {
        package_id:     '11111111-1111-1111-1111-111111111111',
        tenant_id:      TENANT_ID,
        requisition_id: '33333333-3333-3333-3333-333333333333',
        candidate_id:   '44444444-4444-4444-4444-444444444444',
        base_salary:    15000, currency: 'SAR',
        allowances:     [],
        created_at:     '2026-03-07T07:00:00Z',
        event_id:       'ev-c1', occurred_at: '2026-03-07T07:00:00Z',
        actor: ACTOR, correlation_id: 'c', causation_id: 'c',
      },
    });
    assert.equal(res.status, 201);
    assert.equal(res.body.status, 'DRAFT');
  });

  test('POST /hiring/compensation/approve → 200 APPROVED', async () => {
    const router = makeRouter();
    const body = {
      package_id:     'pkg-approve-1',
      tenant_id:      TENANT_ID,
      requisition_id: '33333333-3333-3333-3333-333333333333',
      candidate_id:   '44444444-4444-4444-4444-444444444444',
      base_salary:    20000, currency: 'SAR', allowances: [],
      created_at:     '2026-03-07T07:00:00Z',
      event_id:       'ev-ca1', occurred_at: '2026-03-07T07:00:00Z',
      actor: ACTOR, correlation_id: 'c', causation_id: 'c',
    };
    await router.handle({ method: 'POST', path: '/hiring/compensation/draft', body });

    const res = await router.handle({
      method: 'POST', path: '/hiring/compensation/approve',
      body: {
        package_id:  'pkg-approve-1',
        approved_by: 'u-cfo',
        approved_at: '2026-03-07T08:00:00Z',
        event_id:    'ev-ca2', occurred_at: '2026-03-07T08:00:00Z',
        actor: ACTOR, correlation_id: 'c', causation_id: 'c',
      },
    });
    assert.equal(res.status, 200);
    assert.equal(res.body.status, 'APPROVED');
  });

  test('GET /hiring/compensation → 200 array', async () => {
    const router = makeRouter();
    const res = await router.handle({ method: 'GET', path: '/hiring/compensation', body: {} });
    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.body));
  });
});

describe('HiringRouter — offers', () => {
  test('POST /hiring/offers → 201 PENDING', async () => {
    const router = makeRouter();
    const res = await router.handle({
      method: 'POST', path: '/hiring/offers',
      body: {
        offer_id:       'offer-r1',
        tenant_id:      TENANT_ID,
        requisition_id: 'req-1',
        candidate_id:   'cand-1',
        package_id:     'pkg-1',
        created_at:     '2026-03-07T07:00:00Z',
        event_id:       'ev-o1', occurred_at: '2026-03-07T07:00:00Z',
        actor: ACTOR, correlation_id: 'c', causation_id: 'c',
      },
    });
    assert.equal(res.status, 201);
    assert.equal(res.body.status, 'PENDING');
  });

  test('GET /hiring/offers → 200 array', async () => {
    const router = makeRouter();
    const res = await router.handle({ method: 'GET', path: '/hiring/offers', body: {} });
    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.body));
  });
});

describe('HiringRouter — approvals', () => {
  test('POST /hiring/approvals/request → 201 PENDING', async () => {
    const router = makeRouter();
    const res = await router.handle({
      method: 'POST', path: '/hiring/approvals/request',
      body: {
        approval_id:    'appr-r1',
        tenant_id:      TENANT_ID,
        offer_id:       'offer-1',
        requisition_id: 'req-1',
        requested_by:   'u-mgr',
        approver_id:    'u-cfo',
        requested_at:   '2026-03-07T07:00:00Z',
        created_at:     '2026-03-07T07:00:00Z',
        event_id:       'ev-ar1', occurred_at: '2026-03-07T07:00:00Z',
        actor: ACTOR, correlation_id: 'c', causation_id: 'c',
      },
    });
    assert.equal(res.status, 201);
    assert.equal(res.body.status, 'PENDING');
  });

  test('GET /hiring/approvals → 200 array', async () => {
    const router = makeRouter();
    const res = await router.handle({ method: 'GET', path: '/hiring/approvals', body: {} });
    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.body));
  });
});

describe('HiringRouter — acceptance', () => {
  test('POST /hiring/acceptance → 201', async () => {
    const router = makeRouter();
    const res = await router.handle({
      method: 'POST', path: '/hiring/acceptance',
      body: {
        acceptance_id: 'acc-r1',
        tenant_id:     TENANT_ID,
        offer_id:      'offer-1',
        candidate_id:  'cand-1',
        response:      'ACCEPTED',
        responded_at:  '2026-03-07T10:00:00Z',
        created_at:    '2026-03-07T10:00:00Z',
        event_id:      'ev-acc1', occurred_at: '2026-03-07T10:00:00Z',
        actor: ACTOR, correlation_id: 'c', causation_id: 'c',
      },
    });
    assert.equal(res.status, 201);
    assert.equal(res.body.response, 'ACCEPTED');
  });

  test('GET /hiring/acceptance → 200 array', async () => {
    const router = makeRouter();
    const res = await router.handle({ method: 'GET', path: '/hiring/acceptance', body: {} });
    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.body));
  });
});

describe('HiringRouter — decisions', () => {
  test('POST /hiring/decisions → 201', async () => {
    const router = makeRouter();
    const res = await router.handle({
      method: 'POST', path: '/hiring/decisions',
      body: {
        decision_id:    'dec-r1',
        tenant_id:      TENANT_ID,
        requisition_id: 'req-1',
        candidate_id:   'cand-1',
        decision:       'HIRED',
        decided_by:     'u-cto',
        decided_at:     '2026-03-07T11:00:00Z',
        created_at:     '2026-03-07T11:00:00Z',
        event_id:       'ev-dec1', occurred_at: '2026-03-07T11:00:00Z',
        actor: ACTOR, correlation_id: 'c', causation_id: 'c',
      },
    });
    assert.equal(res.status, 201);
    assert.equal(res.body.decision, 'HIRED');
  });

  test('GET /hiring/decisions → 200 array', async () => {
    const router = makeRouter();
    const res = await router.handle({ method: 'GET', path: '/hiring/decisions', body: {} });
    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.body));
  });
});

describe('HiringRouter — unknown routes', () => {
  test('unknown path returns 404', async () => {
    const router = makeRouter();
    const res = await router.handle({ method: 'GET', path: '/hiring/unknown', body: {} });
    assert.equal(res.status, 404);
  });
});
