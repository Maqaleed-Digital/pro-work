'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { createCandidateService, InMemoryCandidateStore } = require('../app/modules/recruiting/candidate_service');

function makeHooks() {
  const events = [];
  return { events, publish: async (event) => events.push(event) };
}

const BASE_INPUT = {
  event_id:       '11111111-1111-1111-1111-111111111111',
  occurred_at:    '2026-03-06T20:00:00Z',
  tenant_id:      '22222222-2222-2222-2222-222222222222',
  candidate_id:   '33333333-3333-3333-3333-333333333333',
  candidate_type: 'FTE',
  full_name:      'Jane Doe',
  nationality_code: 'SA',
  current_status: 'ACTIVE_PIPELINE',
  skills:         ['node', 'recruiting'],
  created_at:     '2026-03-06T20:00:00Z',
  actor:          { actor_type: 'HUMAN', actor_id: '44444444-4444-4444-4444-444444444444' },
  correlation_id: '55555555-5555-5555-5555-555555555555',
  causation_id:   '66666666-6666-6666-6666-666666666666',
};

describe('CandidateService — createCandidate', () => {
  test('creates candidate and emits CANDIDATE_CREATED', async () => {
    const h = makeHooks();
    const svc = createCandidateService({ store: new InMemoryCandidateStore(), hooks: h });
    const c = await svc.createCandidate(BASE_INPUT);
    assert.equal(c.full_name, 'Jane Doe');
    assert.equal(c.candidate_type, 'FTE');
    assert.equal(c.availability_status, 'AVAILABLE');
    assert.equal(h.events.length, 1);
    assert.equal(h.events[0].event_type, 'CANDIDATE_CREATED');
    assert.equal(h.events[0].trust_level, 'STANDARD');
    assert.equal(h.events[0].payload.skill_count, 2);
  });

  test('rejects invalid candidate_type', async () => {
    const h = makeHooks();
    const svc = createCandidateService({ store: new InMemoryCandidateStore(), hooks: h });
    await assert.rejects(
      () => svc.createCandidate({ ...BASE_INPUT, candidate_type: 'PERMANENT' }),
      /candidate_type must be FTE or FREELANCER/
    );
  });

  test('rejects missing full_name', async () => {
    const h = makeHooks();
    const svc = createCandidateService({ store: new InMemoryCandidateStore(), hooks: h });
    await assert.rejects(
      () => svc.createCandidate({ ...BASE_INPUT, full_name: '' }),
      /full_name is required/
    );
  });

  test('rejects non-array skills', async () => {
    const h = makeHooks();
    const svc = createCandidateService({ store: new InMemoryCandidateStore(), hooks: h });
    await assert.rejects(
      () => svc.createCandidate({ ...BASE_INPUT, skills: 'node' }),
      /skills must be an array/
    );
  });
});

describe('CandidateService — getCandidate / listCandidates', () => {
  test('getCandidate returns stored candidate', async () => {
    const h = makeHooks();
    const svc = createCandidateService({ store: new InMemoryCandidateStore(), hooks: h });
    await svc.createCandidate(BASE_INPUT);
    const fetched = await svc.getCandidate(BASE_INPUT.candidate_id);
    assert.equal(fetched.candidate_id, BASE_INPUT.candidate_id);
  });

  test('getCandidate returns null for unknown id', async () => {
    const h = makeHooks();
    const svc = createCandidateService({ store: new InMemoryCandidateStore(), hooks: h });
    assert.equal(await svc.getCandidate('ghost'), null);
  });

  test('listCandidates returns all inserted candidates', async () => {
    const h = makeHooks();
    const svc = createCandidateService({ store: new InMemoryCandidateStore(), hooks: h });
    await svc.createCandidate(BASE_INPUT);
    await svc.createCandidate({ ...BASE_INPUT, candidate_id: 'aaaa', full_name: 'Bob' });
    const all = await svc.listCandidates();
    assert.equal(all.length, 2);
  });
});

describe('CandidateService — updateCandidate', () => {
  test('updates candidate and emits CANDIDATE_UPDATED', async () => {
    const h = makeHooks();
    const svc = createCandidateService({ store: new InMemoryCandidateStore(), hooks: h });
    await svc.createCandidate(BASE_INPUT);
    const updated = await svc.updateCandidate({
      event_id:       'eeee-0000',
      occurred_at:    '2026-03-06T21:00:00Z',
      candidate_id:   BASE_INPUT.candidate_id,
      current_status: 'INTERVIEWING',
      availability_status: 'ON_HOLD',
      skills:         ['node', 'typescript'],
      updated_at:     '2026-03-06T21:00:00Z',
      actor:          { actor_type: 'HUMAN', actor_id: 'u-hr' },
      correlation_id: 'corr-2',
      causation_id:   'caus-2',
    });
    assert.equal(updated.current_status, 'INTERVIEWING');
    const updatedEvt = h.events.find(e => e.event_type === 'CANDIDATE_UPDATED');
    assert.ok(updatedEvt);
    assert.equal(updatedEvt.payload.current_status, 'INTERVIEWING');
  });

  test('update of unknown candidate throws', async () => {
    const h = makeHooks();
    const svc = createCandidateService({ store: new InMemoryCandidateStore(), hooks: h });
    await assert.rejects(
      () => svc.updateCandidate({ candidate_id: 'ghost', occurred_at: 'x', actor: {} }),
      /candidate not found/
    );
  });
});
