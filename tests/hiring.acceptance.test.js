'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { createAcceptanceService } = require('../app/modules/hiring/acceptance_service');

function makeHooks() {
  const events = [];
  return { events, publish: async (e) => events.push(e) };
}

describe('AcceptanceService — acceptOffer', () => {
  test('emits OFFER_ACCEPTED (HIGH) and returns ACCEPTED status', async () => {
    const h = makeHooks();
    const svc = createAcceptanceService({ hooks: h });
    const result = await svc.acceptOffer('offer-1');
    assert.equal(result.offer_id, 'offer-1');
    assert.equal(result.status,   'ACCEPTED');
    assert.equal(h.events[0].event_type,       'OFFER_ACCEPTED');
    assert.equal(h.events[0].trust_level,      'HIGH');
    assert.equal(h.events[0].requires_approval, true);
    assert.equal(h.events[0].aggregate_type,   'OFFER');
    assert.equal(h.events[0].aggregate_id,     'offer-1');
    assert.equal(h.events[0].payload.offer_id, 'offer-1');
  });

  test('accepts object input with offer_id', async () => {
    const h = makeHooks();
    const svc = createAcceptanceService({ hooks: h });
    const result = await svc.acceptOffer({ offer_id: 'offer-2', tenant_id: 't1' });
    assert.equal(result.offer_id, 'offer-2');
    assert.equal(result.status,   'ACCEPTED');
  });

  test('rejects missing offer_id', async () => {
    const svc = createAcceptanceService({ hooks: makeHooks() });
    await assert.rejects(() => svc.acceptOffer(''), /offer_id is required/);
  });
});

describe('AcceptanceService — declineOffer', () => {
  test('emits OFFER_DECLINED (STANDARD) and returns DECLINED status', async () => {
    const h = makeHooks();
    const svc = createAcceptanceService({ hooks: h });
    const result = await svc.declineOffer('offer-3');
    assert.equal(result.offer_id, 'offer-3');
    assert.equal(result.status,   'DECLINED');
    assert.equal(h.events[0].event_type,       'OFFER_DECLINED');
    assert.equal(h.events[0].trust_level,      'STANDARD');
    assert.equal(h.events[0].requires_approval, false);
    assert.equal(h.events[0].payload.offer_id, 'offer-3');
  });

  test('accepts object input with offer_id', async () => {
    const h = makeHooks();
    const svc = createAcceptanceService({ hooks: h });
    const result = await svc.declineOffer({ offer_id: 'offer-4', tenant_id: 't1' });
    assert.equal(result.offer_id, 'offer-4');
    assert.equal(result.status,   'DECLINED');
  });

  test('rejects missing offer_id', async () => {
    const svc = createAcceptanceService({ hooks: makeHooks() });
    await assert.rejects(() => svc.declineOffer(''), /offer_id is required/);
  });
});
