'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { createAcceptanceService, InMemoryAcceptanceStore } = require('../app/modules/hiring/acceptance_service');

function makeHooks() {
  const events = [];
  return { events, publish: async (e) => events.push(e) };
}

const BASE = {
  acceptance_id: 'bbbb0001-0000-0000-0000-000000000001',
  tenant_id:     '22222222-2222-2222-2222-222222222222',
  offer_id:      '33333333-3333-3333-3333-333333333333',
  candidate_id:  '44444444-4444-4444-4444-444444444444',
  response:      'ACCEPTED',
  responded_at:  '2026-03-07T10:00:00Z',
  created_at:    '2026-03-07T10:00:00Z',
  event_id:      '55555555-5555-5555-5555-555555555555',
  occurred_at:   '2026-03-07T10:00:00Z',
  actor:         { actor_type: 'HUMAN', actor_id: '44444444-4444-4444-4444-444444444444' },
  correlation_id: '66666666-6666-6666-6666-666666666666',
  causation_id:   '77777777-7777-7777-7777-777777777777',
};

describe('AcceptanceService — recordAcceptance', () => {
  test('records ACCEPTED and emits CANDIDATE_ACCEPTANCE_RECORDED (HIGH)', async () => {
    const h = makeHooks();
    const svc = createAcceptanceService({ store: new InMemoryAcceptanceStore(), hooks: h });
    const acceptance = await svc.recordAcceptance(BASE);
    assert.equal(acceptance.response, 'ACCEPTED');
    assert.equal(acceptance.offer_id, BASE.offer_id);
    const evt = h.events[0];
    assert.equal(evt.event_type, 'CANDIDATE_ACCEPTANCE_RECORDED');
    assert.equal(evt.trust_level, 'HIGH');
    assert.equal(evt.requires_approval, true);
    assert.equal(evt.aggregate_type, 'HIRING_OFFER');
    assert.equal(evt.aggregate_id, BASE.offer_id);
    assert.equal(evt.payload.response, 'ACCEPTED');
  });

  test('records DECLINED with decline_reason', async () => {
    const h = makeHooks();
    const svc = createAcceptanceService({ store: new InMemoryAcceptanceStore(), hooks: h });
    const acceptance = await svc.recordAcceptance({
      ...BASE,
      acceptance_id:  'bbbb0002-0000-0000-0000-000000000002',
      response:       'DECLINED',
      decline_reason: 'OFFER_TOO_LOW',
      event_id:       'ev-dec-2',
    });
    assert.equal(acceptance.response, 'DECLINED');
    assert.equal(acceptance.decline_reason, 'OFFER_TOO_LOW');
    assert.equal(h.events[0].payload.response, 'DECLINED');
  });

  test('rejects invalid response value', async () => {
    const svc = createAcceptanceService({ store: new InMemoryAcceptanceStore(), hooks: makeHooks() });
    await assert.rejects(
      () => svc.recordAcceptance({ ...BASE, response: 'MAYBE' }),
      /response must be ACCEPTED or DECLINED/,
    );
  });

  test('rejects missing acceptance_id', async () => {
    const svc = createAcceptanceService({ store: new InMemoryAcceptanceStore(), hooks: makeHooks() });
    await assert.rejects(
      () => svc.recordAcceptance({ ...BASE, acceptance_id: '' }),
      /acceptance_id is required/,
    );
  });

  test('rejects missing offer_id', async () => {
    const svc = createAcceptanceService({ store: new InMemoryAcceptanceStore(), hooks: makeHooks() });
    await assert.rejects(
      () => svc.recordAcceptance({ ...BASE, offer_id: '' }),
      /offer_id is required/,
    );
  });

  test('rejects missing responded_at', async () => {
    const svc = createAcceptanceService({ store: new InMemoryAcceptanceStore(), hooks: makeHooks() });
    await assert.rejects(
      () => svc.recordAcceptance({ ...BASE, responded_at: '' }),
      /responded_at is required/,
    );
  });
});

describe('AcceptanceService — getAcceptance / listAcceptances', () => {
  test('getAcceptance returns stored record', async () => {
    const svc = createAcceptanceService({ store: new InMemoryAcceptanceStore(), hooks: makeHooks() });
    await svc.recordAcceptance(BASE);
    const rec = await svc.getAcceptance(BASE.acceptance_id);
    assert.equal(rec.acceptance_id, BASE.acceptance_id);
  });

  test('listAcceptances returns all', async () => {
    const svc = createAcceptanceService({ store: new InMemoryAcceptanceStore(), hooks: makeHooks() });
    await svc.recordAcceptance(BASE);
    await svc.recordAcceptance({ ...BASE, acceptance_id: 'acc-2', event_id: 'ev-2' });
    assert.equal((await svc.listAcceptances()).length, 2);
  });
});
