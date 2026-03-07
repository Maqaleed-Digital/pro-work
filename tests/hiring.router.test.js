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

describe('HiringRouter — cases', () => {
  test('POST /hiring/cases → 201 SCREENED', async () => {
    const router = makeRouter();
    const res = await router.handle({
      method: 'POST', path: '/hiring/cases',
      body: { tenant_id: TENANT_ID, candidate_id: 'c1', requisition_id: 'r1' },
    });
    assert.equal(res.status, 201);
    assert.equal(res.body.status, 'SCREENED');
    assert.ok(res.body.id);
  });

  test('GET /hiring/cases → 200 array', async () => {
    const router = makeRouter();
    const res = await router.handle({ method: 'GET', path: '/hiring/cases', body: {} });
    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.body));
  });
});

describe('HiringRouter — compensation', () => {
  test('POST /hiring/compensation/validate → 200 gross_amount', async () => {
    const router = makeRouter();
    const res = await router.handle({
      method: 'POST', path: '/hiring/compensation/validate',
      body: { id: 'offer-r1', tenant_id: TENANT_ID, base_salary: 15000, currency: 'SAR', allowances: [] },
    });
    assert.equal(res.status, 200);
    assert.equal(res.body.gross_amount, 15000);
  });
});

describe('HiringRouter — approvals', () => {
  test('POST /hiring/approvals/request → 201', async () => {
    const router = makeRouter();
    const res = await router.handle({
      method: 'POST', path: '/hiring/approvals/request',
      body: { hiring_case_id: 'case-1', actor_id: 'u-cfo', tenant_id: TENANT_ID },
    });
    assert.equal(res.status, 201);
    assert.equal(res.body.hiring_case_id, 'case-1');
  });

  test('POST /hiring/approvals/approve → 200 true', async () => {
    const router = makeRouter();
    const res = await router.handle({
      method: 'POST', path: '/hiring/approvals/approve',
      body: { hiring_case_id: 'case-2', actor_id: 'u-cfo', tenant_id: TENANT_ID },
    });
    assert.equal(res.status, 200);
    assert.equal(res.body, true);
  });

  test('GET /hiring/approvals → 200 array', async () => {
    const router = makeRouter();
    const res = await router.handle({ method: 'GET', path: '/hiring/approvals', body: {} });
    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.body));
  });
});

describe('HiringRouter — offers', () => {
  test('POST /hiring/offers → 201 DRAFT', async () => {
    const router = makeRouter();
    const res = await router.handle({
      method: 'POST', path: '/hiring/offers',
      body: { hiring_case_id: 'case-1', tenant_id: TENANT_ID, package_data: { base_salary: 12000, currency: 'SAR' } },
    });
    assert.equal(res.status, 201);
    assert.equal(res.body.status, 'DRAFT');
    assert.ok(res.body.id);
  });

  test('GET /hiring/offers → 200 array', async () => {
    const router = makeRouter();
    const res = await router.handle({ method: 'GET', path: '/hiring/offers', body: {} });
    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.body));
  });
});

describe('HiringRouter — acceptance', () => {
  test('POST /hiring/acceptance/accept → 200 ACCEPTED', async () => {
    const router = makeRouter();
    const res = await router.handle({
      method: 'POST', path: '/hiring/acceptance/accept',
      body: { offer_id: 'offer-1', tenant_id: TENANT_ID },
    });
    assert.equal(res.status, 200);
    assert.equal(res.body.status, 'ACCEPTED');
  });

  test('POST /hiring/acceptance/decline → 200 DECLINED', async () => {
    const router = makeRouter();
    const res = await router.handle({
      method: 'POST', path: '/hiring/acceptance/decline',
      body: { offer_id: 'offer-2', tenant_id: TENANT_ID },
    });
    assert.equal(res.status, 200);
    assert.equal(res.body.status, 'DECLINED');
  });
});

describe('HiringRouter — qiwa mapping', () => {
  test('POST /hiring/qiwa/map → 200 parity_score', async () => {
    const router = makeRouter();
    const res = await router.handle({
      method: 'POST', path: '/hiring/qiwa/map',
      body: { case_id: 'case-1', tenant_id: TENANT_ID, role_title: 'Engineer' },
    });
    assert.equal(res.status, 200);
    assert.equal(res.body.parity_score, 100);
  });
});

describe('HiringRouter — unknown routes', () => {
  test('unknown path returns 404', async () => {
    const router = makeRouter();
    const res = await router.handle({ method: 'GET', path: '/hiring/unknown', body: {} });
    assert.equal(res.status, 404);
  });
});
