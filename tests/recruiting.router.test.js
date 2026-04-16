'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { createRecruitingModule }  = require('../app/modules/recruiting/index');
const { createRecruitingRouter }  = require('../app/api/recruiting_router');

function makeHooks() {
  return { publish: async () => {} };
}

function makeRouter() {
  const recruiting = createRecruitingModule({ hooks: makeHooks() });
  const router     = createRecruitingRouter({ recruiting });
  return { router, recruiting };
}

const CAND_BODY = {
  event_id:       '11111111-1111-1111-1111-111111111111',
  occurred_at:    '2026-03-06T20:00:00Z',
  tenant_id:      '22222222-2222-2222-2222-222222222222',
  candidate_id:   '33333333-3333-3333-3333-333333333333',
  candidate_type: 'FTE',
  full_name:      'Jane Doe',
  nationality_code: 'SA',
  current_status: 'ACTIVE_PIPELINE',
  skills:         ['node'],
  created_at:     '2026-03-06T20:00:00Z',
  actor:          { actor_type: 'HUMAN', actor_id: '44444444-4444-4444-4444-444444444444' },
  correlation_id: 'corr-1',
  causation_id:   'caus-1',
};

const REQ_BODY = {
  event_id:         'eeee1111-1111-1111-1111-111111111111',
  occurred_at:      '2026-03-06T20:00:00Z',
  tenant_id:        '22222222-2222-2222-2222-222222222222',
  requisition_id:   'ffff2222-2222-2222-2222-222222222222',
  establishment_id: 'aaaa3333-3333-3333-3333-333333333333',
  title:            'Backend Engineer',
  role_family:      'Engineering',
  contract_type:    'FTE',
  required_skills:  ['node'],
  hiring_manager_id: 'bbbb4444-4444-4444-4444-444444444444',
  created_at:       '2026-03-06T20:00:00Z',
  actor:            { actor_type: 'HUMAN', actor_id: 'cccc5555-5555-5555-5555-555555555555' },
  correlation_id:   'corr-r1',
  causation_id:     'caus-r1',
};

describe('RecruitingRouter — candidates', () => {
  test('POST /recruiting/candidates → 201 with full_name', async () => {
    const { router } = makeRouter();
    const res = await router.handle({ method: 'POST', path: '/recruiting/candidates', body: CAND_BODY });
    assert.equal(res.status, 201);
    assert.equal(res.body.full_name, 'Jane Doe');
  });

  test('GET /recruiting/candidates → 200 with list', async () => {
    const { router } = makeRouter();
    await router.handle({ method: 'POST', path: '/recruiting/candidates', body: CAND_BODY });
    const res = await router.handle({ method: 'GET', path: '/recruiting/candidates', body: {} });
    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.body));
    assert.equal(res.body.length, 1);
  });

  test('POST with invalid candidate_type → service error propagated', async () => {
    const { router } = makeRouter();
    await assert.rejects(
      () => router.handle({ method: 'POST', path: '/recruiting/candidates', body: { ...CAND_BODY, candidate_type: 'INVALID' } }),
      /candidate_type must be FTE or FREELANCER/
    );
  });
});

describe('RecruitingRouter — requisitions', () => {
  test('POST /recruiting/requisitions → 201 in DRAFT', async () => {
    const { router } = makeRouter();
    const res = await router.handle({ method: 'POST', path: '/recruiting/requisitions', body: REQ_BODY });
    assert.equal(res.status, 201);
    assert.equal(res.body.status, 'DRAFT');
  });

  test('GET /recruiting/requisitions → 200 with list', async () => {
    const { router } = makeRouter();
    await router.handle({ method: 'POST', path: '/recruiting/requisitions', body: REQ_BODY });
    const res = await router.handle({ method: 'GET', path: '/recruiting/requisitions', body: {} });
    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.body));
    assert.equal(res.body.length, 1);
  });

  test('POST /recruiting/requisitions/transition → 200 transitions to OPEN', async () => {
    const { router } = makeRouter();
    await router.handle({ method: 'POST', path: '/recruiting/requisitions', body: REQ_BODY });
    const res = await router.handle({
      method: 'POST',
      path:   '/recruiting/requisitions/transition',
      body: {
        event_id:       'ev-t',
        occurred_at:    '2026-03-06T20:01:00Z',
        requisition_id: REQ_BODY.requisition_id,
        next_status:    'OPEN',
        updated_at:     '2026-03-06T20:01:00Z',
        actor:          { actor_type: 'HUMAN', actor_id: 'u-mgr' },
        correlation_id: 'c2', causation_id: 'c2',
      },
    });
    assert.equal(res.status, 200);
    assert.equal(res.body.status, 'OPEN');
  });
});

describe('RecruitingRouter — unknown routes', () => {
  test('unknown path returns 404', async () => {
    const { router } = makeRouter();
    const res = await router.handle({ method: 'GET', path: '/recruiting/unknown', body: {} });
    assert.equal(res.status, 404);
  });
});
