'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { createConsentService, InMemoryConsentStore } = require('../app/modules/onboarding/consent_service');

function makeHooks() {
  const events = [];
  return { events, publish: async (e) => events.push(e) };
}

const BASE = {
  consent_id:         '11111111-1111-1111-1111-111111111111',
  tenant_id:          '22222222-2222-2222-2222-222222222222',
  worker_id:          '33333333-3333-3333-3333-333333333333',
  onboarding_case_id: '44444444-4444-4444-4444-444444444444',
  consent_type:       'DATA_PROCESSING',
  consent_version:    '1.0',
  acknowledged_at:    '2026-03-07T01:00:00Z',
  event_id:           '55555555-5555-5555-5555-555555555555',
  occurred_at:        '2026-03-07T01:00:00Z',
  actor:              { actor_type: 'HUMAN', actor_id: '66666666-6666-6666-6666-666666666666' },
  correlation_id:     '77777777-7777-7777-7777-777777777777',
  causation_id:       '88888888-8888-8888-8888-888888888888',
};

describe('ConsentService — acknowledgeConsent', () => {
  test('records consent and emits CONSENT_ACKNOWLEDGED (STANDARD)', async () => {
    const h = makeHooks();
    const svc = createConsentService({ store: new InMemoryConsentStore(), hooks: h });
    const out = await svc.acknowledgeConsent(BASE);
    assert.equal(out.consent_type, 'DATA_PROCESSING');
    assert.equal(out.worker_id, BASE.worker_id);
    assert.equal(h.events.length, 1);
    assert.equal(h.events[0].event_type, 'CONSENT_ACKNOWLEDGED');
    assert.equal(h.events[0].trust_level, 'STANDARD');
    assert.equal(h.events[0].requires_approval, false);
  });

  test('rejects missing consent_id', async () => {
    const svc = createConsentService({ store: new InMemoryConsentStore(), hooks: makeHooks() });
    await assert.rejects(() => svc.acknowledgeConsent({ ...BASE, consent_id: '' }), /consent_id is required/);
  });

  test('rejects missing onboarding_case_id', async () => {
    const svc = createConsentService({ store: new InMemoryConsentStore(), hooks: makeHooks() });
    await assert.rejects(
      () => svc.acknowledgeConsent({ ...BASE, onboarding_case_id: '' }),
      /onboarding_case_id is required/,
    );
  });

  test('rejects missing worker_id', async () => {
    const svc = createConsentService({ store: new InMemoryConsentStore(), hooks: makeHooks() });
    await assert.rejects(() => svc.acknowledgeConsent({ ...BASE, worker_id: '' }), /worker_id is required/);
  });

  test('multiple consents accumulate in store', async () => {
    const h = makeHooks();
    const svc = createConsentService({ store: new InMemoryConsentStore(), hooks: h });
    await svc.acknowledgeConsent(BASE);
    await svc.acknowledgeConsent({ ...BASE, consent_id: 'c-2', consent_type: 'BACKGROUND_CHECK' });
    assert.equal(h.events.length, 2);
  });
});
