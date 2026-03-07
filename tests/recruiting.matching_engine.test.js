'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { createMatchingEngine, InMemoryMatchStore } = require('../app/modules/recruiting/matching_engine');

function makeHooks() {
  const events = [];
  return { events, publish: async (event) => events.push(event) };
}

const REQUISITION = {
  tenant_id:              '22222222-2222-2222-2222-222222222222',
  requisition_id:         '33333333-3333-3333-3333-333333333333',
  title:                  'Backend Engineer',
  role_family:            'Engineering',
  contract_type:          'FTE',
  required_skills:        ['node', 'postgres'],
  occupation_code_target: '251201',
};

const EMPLOYER = { current_band: 'GREEN', establishment_size: 1000 };
const POLICY   = { prohibited_titles: [], credentials_required_by_role_family: { Engineering: [] } };

function makeEventIds(candidateIds) {
  const ids = {};
  for (const key of ['candidate_matched', 'nitaqat_preview_generated', 'occupation_match_validated', 'ai_match_explanation_logged']) {
    ids[key] = {};
    for (const cid of candidateIds) {
      ids[key][cid] = `${key.slice(0,2)}-${cid}`;
    }
  }
  return ids;
}

function makeRankInput(candidates) {
  return {
    occurred_at:    '2026-03-06T20:00:00Z',
    actor:          { actor_type: 'HUMAN', actor_id: 'u-ai' },
    correlation_id: 'corr-match',
    causation_id:   'caus-match',
    requisition:    REQUISITION,
    employerProfile: EMPLOYER,
    policyRules:    POLICY,
    candidates,
    event_ids:      makeEventIds(candidates.map(c => c.candidate_id)),
  };
}

describe('rankCandidates', () => {
  test('ranks FTE above FREELANCER with equal skills (internal boost)', async () => {
    const h = makeHooks();
    const engine = createMatchingEngine({ matchStore: new InMemoryMatchStore(), hooks: h });

    const results = await engine.rankCandidates(makeRankInput([
      { candidate_id: 'c1', candidate_type: 'FTE',        availability_status: 'AVAILABLE', skills: ['node', 'postgres'], nationality_code: 'SA', credentials: [] },
      { candidate_id: 'c2', candidate_type: 'FREELANCER', availability_status: 'AVAILABLE', skills: ['node', 'postgres'], nationality_code: 'SA', credentials: [] },
    ]));

    assert.equal(results[0].candidate_id, 'c1');
    assert.ok(results[0].final_score > results[1].final_score);
  });

  test('emits 4 events per candidate (MATCHED, NITAQAT, OCCUPATION, AI_EXPLANATION)', async () => {
    const h = makeHooks();
    const engine = createMatchingEngine({ matchStore: new InMemoryMatchStore(), hooks: h });

    await engine.rankCandidates(makeRankInput([
      { candidate_id: 'c1', candidate_type: 'FTE', availability_status: 'AVAILABLE', skills: ['node'], nationality_code: 'SA', credentials: [] },
    ]));

    assert.equal(h.events.length, 4);
    const types = h.events.map(e => e.event_type);
    assert.ok(types.includes('CANDIDATE_MATCHED'));
    assert.ok(types.includes('NITAQAT_PREVIEW_GENERATED'));
    assert.ok(types.includes('OCCUPATION_MATCH_VALIDATED'));
    assert.ok(types.includes('AI_MATCH_EXPLANATION_LOGGED'));
  });

  test('NITAQAT_PREVIEW_GENERATED has trust_level=HIGH and requires_approval=true', async () => {
    const h = makeHooks();
    const engine = createMatchingEngine({ matchStore: new InMemoryMatchStore(), hooks: h });
    await engine.rankCandidates(makeRankInput([
      { candidate_id: 'cx', candidate_type: 'FTE', availability_status: 'AVAILABLE', skills: ['node'], nationality_code: 'SA', credentials: [] },
    ]));
    const evt = h.events.find(e => e.event_type === 'NITAQAT_PREVIEW_GENERATED');
    assert.equal(evt.trust_level, 'HIGH');
    assert.equal(evt.requires_approval, true);
  });

  test('Saudi national gets POSITIVE movement_band (score ≥ 70)', async () => {
    const h = makeHooks();
    const engine = createMatchingEngine({ matchStore: new InMemoryMatchStore(), hooks: h });
    const results = await engine.rankCandidates(makeRankInput([
      { candidate_id: 'sa', candidate_type: 'FTE', availability_status: 'AVAILABLE', skills: ['node'], nationality_code: 'SA', credentials: [] },
    ]));
    assert.equal(results[0].nitaqat_preview.movement_band, 'POSITIVE');
  });

  test('non-Saudi national gets NEUTRAL or NEGATIVE movement_band', async () => {
    const h = makeHooks();
    const engine = createMatchingEngine({ matchStore: new InMemoryMatchStore(), hooks: h });
    const results = await engine.rankCandidates(makeRankInput([
      { candidate_id: 'ae', candidate_type: 'FTE', availability_status: 'AVAILABLE', skills: ['node'], nationality_code: 'AE', credentials: [] },
    ]));
    assert.ok(['NEUTRAL', 'NEGATIVE'].includes(results[0].nitaqat_preview.movement_band));
  });

  test('results sorted by final_score descending', async () => {
    const h = makeHooks();
    const engine = createMatchingEngine({ matchStore: new InMemoryMatchStore(), hooks: h });
    const candidates = [
      { candidate_id: 'low',  candidate_type: 'FREELANCER', availability_status: 'AVAILABLE', skills: [],              nationality_code: 'AE', credentials: [] },
      { candidate_id: 'high', candidate_type: 'FTE',        availability_status: 'AVAILABLE', skills: ['node','postgres'], nationality_code: 'SA', credentials: [] },
      { candidate_id: 'mid',  candidate_type: 'FTE',        availability_status: 'AVAILABLE', skills: ['node'],        nationality_code: 'SA', credentials: [] },
    ];
    const results = await engine.rankCandidates(makeRankInput(candidates));
    assert.ok(results[0].final_score >= results[1].final_score);
    assert.ok(results[1].final_score >= results[2].final_score);
  });

  test('occupation compliance penalty reduces score for prohibited title', async () => {
    const h = makeHooks();
    const engine = createMatchingEngine({ matchStore: new InMemoryMatchStore(), hooks: h });

    const strictPolicy = { prohibited_titles: ['Backend Engineer'], credentials_required_by_role_family: {} };
    const input = { ...makeRankInput([
      { candidate_id: 'cx', candidate_type: 'FTE', availability_status: 'AVAILABLE', skills: ['node','postgres'], nationality_code: 'SA', credentials: [] },
    ]), policyRules: strictPolicy };

    const results = await engine.rankCandidates(input);
    assert.equal(results[0].occupation_validation.valid, false);
    // Score should have penalty applied
    assert.ok(results[0].final_score < 1.0);
  });
});

describe('shortlistCandidate', () => {
  test('emits CANDIDATE_SHORTLISTED with trust_level=HIGH', async () => {
    const h = makeHooks();
    const engine = createMatchingEngine({ matchStore: new InMemoryMatchStore(), hooks: h });

    const result = await engine.shortlistCandidate({
      event_id:        '11111111-1111-1111-1111-111111111111',
      occurred_at:     '2026-03-06T20:00:00Z',
      tenant_id:       '22222222-2222-2222-2222-222222222222',
      requisition_id:  REQUISITION.requisition_id,
      candidate_id:    'c1',
      shortlist_reason: 'Top scorer — full skill overlap + Saudi national',
      reviewer_outcome: 'APPROVED',
      actor:           { actor_type: 'HUMAN', actor_id: 'u-hr' },
      correlation_id:  'corr-sl',
      causation_id:    'caus-sl',
    });

    assert.equal(result.reviewer_outcome, 'APPROVED');
    assert.equal(h.events.length, 1);
    assert.equal(h.events[0].event_type, 'CANDIDATE_SHORTLISTED');
    assert.equal(h.events[0].trust_level, 'HIGH');
    assert.equal(h.events[0].requires_approval, true);
  });
});
