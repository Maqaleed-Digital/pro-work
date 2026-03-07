'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { createOfferService, InMemoryOfferStore } = require('../app/modules/hiring/offer_service');

function makeHooks() {
  const events = [];
  return { events, publish: async (e) => events.push(e) };
}

const BASE = {
  offer_id:       'aaaaaaa1-0000-0000-0000-000000000001',
  tenant_id:      '22222222-2222-2222-2222-222222222222',
  requisition_id: '33333333-3333-3333-3333-333333333333',
  candidate_id:   '44444444-4444-4444-4444-444444444444',
  package_id:     '55555555-5555-5555-5555-555555555555',
  created_at:     '2026-03-07T07:00:00Z',
  event_id:       '66666666-6666-6666-6666-666666666666',
  occurred_at:    '2026-03-07T07:00:00Z',
  actor:          { actor_type: 'HUMAN', actor_id: '77777777-7777-7777-7777-777777777777' },
  correlation_id: '88888888-8888-8888-8888-888888888888',
  causation_id:   '99999999-9999-9999-9999-999999999999',
};

describe('OfferService — createOffer', () => {
  test('creates offer in PENDING and emits HIRING_OFFER_CREATED (STANDARD)', async () => {
    const h = makeHooks();
    const svc = createOfferService({ store: new InMemoryOfferStore(), hooks: h });
    const offer = await svc.createOffer(BASE);
    assert.equal(offer.status, 'PENDING');
    assert.equal(offer.offer_id, BASE.offer_id);
    assert.equal(offer.candidate_id, BASE.candidate_id);
    assert.equal(h.events[0].event_type, 'HIRING_OFFER_CREATED');
    assert.equal(h.events[0].trust_level, 'STANDARD');
    assert.equal(h.events[0].requires_approval, false);
  });

  test('rejects missing offer_id', async () => {
    const svc = createOfferService({ store: new InMemoryOfferStore(), hooks: makeHooks() });
    await assert.rejects(() => svc.createOffer({ ...BASE, offer_id: '' }), /offer_id is required/);
  });

  test('rejects missing package_id', async () => {
    const svc = createOfferService({ store: new InMemoryOfferStore(), hooks: makeHooks() });
    await assert.rejects(() => svc.createOffer({ ...BASE, package_id: '' }), /package_id is required/);
  });
});

describe('OfferService — sendOffer', () => {
  test('transitions PENDING → SENT and emits HIRING_OFFER_SENT (HIGH)', async () => {
    const h = makeHooks();
    const svc = createOfferService({ store: new InMemoryOfferStore(), hooks: h });
    await svc.createOffer(BASE);

    const updated = await svc.sendOffer({
      offer_id:    BASE.offer_id,
      sent_by:     'u-hr',
      sent_at:     '2026-03-07T08:00:00Z',
      expiry_date: '2026-03-14T08:00:00Z',
      event_id:    'ev-send-1',
      occurred_at: '2026-03-07T08:00:00Z',
      actor:       { actor_type: 'HUMAN', actor_id: 'u-hr' },
      correlation_id: 'corr-s', causation_id: 'caus-s',
    });

    assert.equal(updated.status, 'SENT');
    assert.equal(updated.sent_by, 'u-hr');
    const evt = h.events.find(e => e.event_type === 'HIRING_OFFER_SENT');
    assert.ok(evt);
    assert.equal(evt.trust_level, 'HIGH');
    assert.equal(evt.requires_approval, true);
  });

  test('rejects sending WITHDRAWN offer', async () => {
    const svc = createOfferService({ store: new InMemoryOfferStore(), hooks: makeHooks() });
    await svc.createOffer(BASE);
    await svc.withdrawOffer({
      offer_id: BASE.offer_id, withdrawn_by: 'u', withdrawn_at: 'x', reason_code: 'CHANGED_MIND',
      event_id: 'ev-w', occurred_at: 'x', actor: { actor_type: 'HUMAN', actor_id: 'u' },
      correlation_id: 'c', causation_id: 'c',
    });
    await assert.rejects(
      () => svc.sendOffer({ offer_id: BASE.offer_id, sent_by: 'u', sent_at: 'x', expiry_date: 'x' }),
      /invalid offer transition/,
    );
  });

  test('rejects missing sent_by', async () => {
    const svc = createOfferService({ store: new InMemoryOfferStore(), hooks: makeHooks() });
    await svc.createOffer(BASE);
    await assert.rejects(
      () => svc.sendOffer({ offer_id: BASE.offer_id, sent_by: '', sent_at: 'x', expiry_date: 'x' }),
      /sent_by is required/,
    );
  });
});

describe('OfferService — withdrawOffer', () => {
  test('transitions PENDING → WITHDRAWN and emits HIRING_OFFER_WITHDRAWN (HIGH)', async () => {
    const h = makeHooks();
    const svc = createOfferService({ store: new InMemoryOfferStore(), hooks: h });
    await svc.createOffer(BASE);

    const updated = await svc.withdrawOffer({
      offer_id:     BASE.offer_id,
      withdrawn_by: 'u-hr',
      withdrawn_at: '2026-03-07T09:00:00Z',
      reason_code:  'POSITION_FILLED',
      event_id:     'ev-withdraw-1',
      occurred_at:  '2026-03-07T09:00:00Z',
      actor:        { actor_type: 'HUMAN', actor_id: 'u-hr' },
      correlation_id: 'corr-w', causation_id: 'caus-w',
    });

    assert.equal(updated.status, 'WITHDRAWN');
    const evt = h.events.find(e => e.event_type === 'HIRING_OFFER_WITHDRAWN');
    assert.ok(evt);
    assert.equal(evt.trust_level, 'HIGH');
    assert.equal(evt.payload.reason_code, 'POSITION_FILLED');
  });

  test('transitions SENT → WITHDRAWN', async () => {
    const svc = createOfferService({ store: new InMemoryOfferStore(), hooks: makeHooks() });
    await svc.createOffer(BASE);
    await svc.sendOffer({
      offer_id: BASE.offer_id, sent_by: 'u', sent_at: 'x', expiry_date: 'x',
      event_id: 'ev-s', occurred_at: 'x', actor: { actor_type: 'HUMAN', actor_id: 'u' },
      correlation_id: 'c', causation_id: 'c',
    });
    const result = await svc.withdrawOffer({
      offer_id: BASE.offer_id, withdrawn_by: 'u', withdrawn_at: 'x', reason_code: 'CHANGED',
      event_id: 'ev-w', occurred_at: 'x', actor: { actor_type: 'HUMAN', actor_id: 'u' },
      correlation_id: 'c', causation_id: 'c',
    });
    assert.equal(result.status, 'WITHDRAWN');
  });

  test('rejects missing reason_code', async () => {
    const svc = createOfferService({ store: new InMemoryOfferStore(), hooks: makeHooks() });
    await svc.createOffer(BASE);
    await assert.rejects(
      () => svc.withdrawOffer({ offer_id: BASE.offer_id, withdrawn_by: 'u', withdrawn_at: 'x', reason_code: '' }),
      /reason_code is required/,
    );
  });
});

describe('OfferService — getOffer / listOffers', () => {
  test('getOffer returns stored offer', async () => {
    const svc = createOfferService({ store: new InMemoryOfferStore(), hooks: makeHooks() });
    await svc.createOffer(BASE);
    const offer = await svc.getOffer(BASE.offer_id);
    assert.equal(offer.offer_id, BASE.offer_id);
  });

  test('listOffers returns all', async () => {
    const svc = createOfferService({ store: new InMemoryOfferStore(), hooks: makeHooks() });
    await svc.createOffer(BASE);
    await svc.createOffer({ ...BASE, offer_id: 'offer-2', event_id: 'ev-2' });
    assert.equal((await svc.listOffers()).length, 2);
  });
});
