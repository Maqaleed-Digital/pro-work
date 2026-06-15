'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { createOfferService, InMemoryOfferStore } = require('../app/modules/hiring/offer_service');

function makeHooks() {
  const events = [];
  return { events, publish: async (e) => events.push(e) };
}

const BASE = {
  hiring_case_id: 'case-1',
  tenant_id:      '22222222-2222-2222-2222-222222222222',
  package_data:   { base_salary: 15000, currency: 'SAR' },
};

describe('OfferService — draftOffer', () => {
  test('creates offer in DRAFT and emits OFFER_DRAFTED (STANDARD)', async () => {
    const h = makeHooks();
    const svc = createOfferService({ store: new InMemoryOfferStore(), hooks: h });
    const offer = await svc.draftOffer(BASE);
    assert.equal(offer.status, 'DRAFT');
    assert.ok(offer.id, 'id must be auto-generated UUID');
    assert.equal(offer.hiring_case_id, BASE.hiring_case_id);
    assert.equal(h.events[0].event_type, 'OFFER_DRAFTED');
    assert.equal(h.events[0].trust_level, 'STANDARD');
    assert.equal(h.events[0].requires_approval, false);
    assert.equal(h.events[0].payload.id,              offer.id);
    assert.equal(h.events[0].payload.hiring_case_id,  BASE.hiring_case_id);
  });

  test('each offer gets a unique id', async () => {
    const svc = createOfferService({ store: new InMemoryOfferStore(), hooks: makeHooks() });
    const a = await svc.draftOffer(BASE);
    const b = await svc.draftOffer(BASE);
    assert.notEqual(a.id, b.id);
  });

  test('merges package_data into the offer record', async () => {
    const svc = createOfferService({ store: new InMemoryOfferStore(), hooks: makeHooks() });
    const offer = await svc.draftOffer(BASE);
    assert.equal(offer.base_salary, 15000);
    assert.equal(offer.currency, 'SAR');
  });

  test('rejects missing hiring_case_id', async () => {
    const svc = createOfferService({ store: new InMemoryOfferStore(), hooks: makeHooks() });
    await assert.rejects(() => svc.draftOffer({ ...BASE, hiring_case_id: '' }), /hiring_case_id is required/);
  });
});

describe('OfferService — sendOffer', () => {
  test('transitions offer to SENT and emits OFFER_SENT', async () => {
    const h = makeHooks();
    const svc = createOfferService({ store: new InMemoryOfferStore(), hooks: h });
    const offer = await svc.draftOffer(BASE);

    const updated = await svc.sendOffer({ offer_id: offer.id, tenant_id: BASE.tenant_id });
    assert.equal(updated.status, 'SENT');
    const evt = h.events.find(e => e.event_type === 'OFFER_SENT');
    assert.ok(evt);
    assert.equal(evt.payload.offer_id, offer.id);
  });

  test('accepts plain string offer_id', async () => {
    const svc = createOfferService({ store: new InMemoryOfferStore(), hooks: makeHooks() });
    const offer = await svc.draftOffer(BASE);
    const updated = await svc.sendOffer(offer.id);
    assert.equal(updated.status, 'SENT');
  });

  test('throws on unknown offer_id', async () => {
    const svc = createOfferService({ store: new InMemoryOfferStore(), hooks: makeHooks() });
    await assert.rejects(() => svc.sendOffer('no-such-offer'), /offer not found/);
  });
});

describe('OfferService — getOffer / listOffers', () => {
  test('getOffer returns stored offer', async () => {
    const svc = createOfferService({ store: new InMemoryOfferStore(), hooks: makeHooks() });
    const offer = await svc.draftOffer(BASE);
    const found = await svc.getOffer(offer.id);
    assert.equal(found.id, offer.id);
  });

  test('listOffers returns all', async () => {
    const svc = createOfferService({ store: new InMemoryOfferStore(), hooks: makeHooks() });
    await svc.draftOffer(BASE);
    await svc.draftOffer(BASE);
    assert.equal((await svc.listOffers()).length, 2);
  });
});
