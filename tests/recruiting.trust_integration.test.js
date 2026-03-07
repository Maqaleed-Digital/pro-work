'use strict';

/**
 * Trust Integration Tests — Sprint B (BRD V3)
 *
 * Verifies that NITAQAT_PREVIEW_GENERATED, OCCUPATION_MATCH_VALIDATED,
 * AI_MATCH_EXPLANATION_LOGGED, and CANDIDATE_SHORTLISTED flow through
 * the trust ledger. Non-sensitive events (CANDIDATE_MATCHED, etc.) do not.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { createEventPublisher, InMemoryEventStore } = require('../app/modules/event_bus/index');
const { createTrustConsumer, InMemoryLedgerStore }  = require('../app/modules/trust_engine/trust_consumer');
const { createMatchingEngine, InMemoryMatchStore }  = require('../app/modules/recruiting/matching_engine');

function makeStack() {
  const eventStore    = new InMemoryEventStore();
  const ledgerStore   = new InMemoryLedgerStore();
  const trustConsumer = createTrustConsumer({ ledgerStore });

  const basePublisher = createEventPublisher({ eventStore });
  const publisher = {
    async publish(event) {
      const stored = await basePublisher.publish(event);
      await trustConsumer.process(stored);
      return stored;
    },
  };

  const hooks = { publish: (e) => publisher.publish(e) };

  return { eventStore, ledgerStore, hooks };
}

const REQUISITION = {
  tenant_id:              'tt',
  requisition_id:         'rq-1',
  title:                  'Backend Engineer',
  role_family:            'Engineering',
  contract_type:          'FTE',
  required_skills:        ['node'],
  occupation_code_target: '251201',
};

function makeRankInput(candidateIds, hooks) {
  const ids = {};
  for (const key of ['candidate_matched', 'nitaqat_preview_generated', 'occupation_match_validated', 'ai_match_explanation_logged']) {
    ids[key] = {};
    for (const cid of candidateIds) {
      ids[key][cid] = `${key.slice(0,4)}-${cid}`;
    }
  }
  return {
    occurred_at:    '2026-03-06T20:00:00Z',
    actor:          { actor_type: 'HUMAN', actor_id: 'u-ai' },
    correlation_id: 'corr',
    causation_id:   'caus',
    requisition:    REQUISITION,
    employerProfile: { current_band: 'GREEN', establishment_size: 1000 },
    policyRules:    { prohibited_titles: [], credentials_required_by_role_family: { Engineering: [] } },
    candidates: candidateIds.map(cid => ({
      candidate_id: cid, candidate_type: 'FTE', availability_status: 'AVAILABLE',
      skills: ['node'], nationality_code: 'SA', credentials: [],
    })),
    event_ids: ids,
  };
}

describe('Trust Integration — NITAQAT_PREVIEW_GENERATED flows to ledger', () => {
  test('NITAQAT_PREVIEW_GENERATED appears in trust ledger', async () => {
    const { eventStore, ledgerStore, hooks } = makeStack();
    const engine = createMatchingEngine({ matchStore: new InMemoryMatchStore(), hooks });

    await engine.rankCandidates(makeRankInput(['c1'], hooks));

    const events = await eventStore.all();
    const evt    = events.find(e => e.event_type === 'NITAQAT_PREVIEW_GENERATED');
    assert.ok(evt, 'NITAQAT_PREVIEW_GENERATED should be in event store');

    const entries = await ledgerStore.all();
    const entry   = entries.find(e => e.event_id === evt.event_id);
    assert.ok(entry, 'NITAQAT_PREVIEW_GENERATED must be in trust ledger');
    assert.ok(entry.entry_hash);
    assert.ok(entry.payload_digest);
  });
});

describe('Trust Integration — OCCUPATION_MATCH_VALIDATED flows to ledger', () => {
  test('OCCUPATION_MATCH_VALIDATED appears in trust ledger', async () => {
    const { eventStore, ledgerStore, hooks } = makeStack();
    const engine = createMatchingEngine({ matchStore: new InMemoryMatchStore(), hooks });

    await engine.rankCandidates(makeRankInput(['c2'], hooks));

    const events = await eventStore.all();
    const evt    = events.find(e => e.event_type === 'OCCUPATION_MATCH_VALIDATED');
    assert.ok(evt);
    const entries = await ledgerStore.all();
    assert.ok(entries.find(e => e.event_id === evt.event_id));
  });
});

describe('Trust Integration — AI_MATCH_EXPLANATION_LOGGED flows to ledger', () => {
  test('AI_MATCH_EXPLANATION_LOGGED appears in trust ledger', async () => {
    const { eventStore, ledgerStore, hooks } = makeStack();
    const engine = createMatchingEngine({ matchStore: new InMemoryMatchStore(), hooks });

    await engine.rankCandidates(makeRankInput(['c3'], hooks));

    const events = await eventStore.all();
    const evt    = events.find(e => e.event_type === 'AI_MATCH_EXPLANATION_LOGGED');
    assert.ok(evt);
    const entries = await ledgerStore.all();
    assert.ok(entries.find(e => e.event_id === evt.event_id));
  });
});

describe('Trust Integration — CANDIDATE_SHORTLISTED flows to ledger', () => {
  test('CANDIDATE_SHORTLISTED appears in trust ledger', async () => {
    const { eventStore, ledgerStore, hooks } = makeStack();
    const engine = createMatchingEngine({ matchStore: new InMemoryMatchStore(), hooks });

    await engine.shortlistCandidate({
      event_id:        'sl-evt-001',
      occurred_at:     '2026-03-06T20:00:00Z',
      tenant_id:       'tt',
      requisition_id:  'rq-1',
      candidate_id:    'c1',
      shortlist_reason: 'Top scorer',
      reviewer_outcome: 'APPROVED',
      actor:           { actor_type: 'HUMAN', actor_id: 'u-hr' },
      correlation_id:  'corr-sl',
      causation_id:    'caus-sl',
    });

    const events = await eventStore.all();
    const evt    = events.find(e => e.event_type === 'CANDIDATE_SHORTLISTED');
    assert.ok(evt);
    const entries = await ledgerStore.all();
    assert.ok(entries.find(e => e.event_id === evt.event_id));
  });
});

describe('Trust Integration — CANDIDATE_MATCHED does NOT go to ledger', () => {
  test('CANDIDATE_MATCHED is not ledgered (non-sensitive)', async () => {
    const { eventStore, ledgerStore, hooks } = makeStack();
    const engine = createMatchingEngine({ matchStore: new InMemoryMatchStore(), hooks });

    await engine.rankCandidates(makeRankInput(['c4'], hooks));

    const events = await eventStore.all();
    const evt    = events.find(e => e.event_type === 'CANDIDATE_MATCHED');
    assert.ok(evt, 'CANDIDATE_MATCHED should be in event store');

    const entries = await ledgerStore.all();
    const entry   = entries.find(e => e.event_id === evt.event_id);
    assert.equal(entry, undefined, 'CANDIDATE_MATCHED must NOT be in trust ledger');
  });
});

describe('Trust Integration — ledger chain integrity', () => {
  test('ledger entries for a 2-candidate rank form a valid chain', async () => {
    const { eventStore, ledgerStore, hooks } = makeStack();
    const engine = createMatchingEngine({ matchStore: new InMemoryMatchStore(), hooks });

    await engine.rankCandidates(makeRankInput(['ca', 'cb'], hooks));

    const entries = await ledgerStore.all();
    // 3 trust-sensitive events per candidate: NITAQAT, OCCUPATION, AI_EXPLANATION → 6 total
    assert.equal(entries.length, 6);

    for (let i = 1; i < entries.length; i++) {
      assert.equal(entries[i].prev_hash, entries[i - 1].entry_hash,
        `chain broken at index ${i}`);
    }
  });
});
