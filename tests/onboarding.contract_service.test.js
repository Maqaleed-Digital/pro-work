'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { createContractService, InMemoryContractStore } = require('../app/modules/onboarding/contract_service');

function makeHooks() {
  const events = [];
  return { events, publish: async (e) => events.push(e) };
}

const BASE_DRAFT = {
  contract_id:        '11111111-1111-1111-1111-111111111111',
  tenant_id:          '22222222-2222-2222-2222-222222222222',
  worker_id:          '33333333-3333-3333-3333-333333333333',
  onboarding_case_id: '44444444-4444-4444-4444-444444444444',
  template_id:        'tmpl-standard',
  role_title:         'Software Engineer',
  wage_base:          12000,
  created_at:         '2026-03-07T01:00:00Z',
  event_id:           '55555555-5555-5555-5555-555555555555',
  occurred_at:        '2026-03-07T01:00:00Z',
  actor:              { actor_type: 'HUMAN', actor_id: '66666666-6666-6666-6666-666666666666' },
  correlation_id:     '77777777-7777-7777-7777-777777777777',
  causation_id:       '88888888-8888-8888-8888-888888888888',
};

describe('ContractService — draftContract', () => {
  test('creates contract in DRAFT, emits CONTRACT_DRAFTED (STANDARD)', async () => {
    const h = makeHooks();
    const svc = createContractService({ store: new InMemoryContractStore(), hooks: h });
    const c = await svc.draftContract(BASE_DRAFT);
    assert.equal(c.status, 'DRAFT');
    assert.equal(c.probation_days, 90);
    assert.equal(h.events[0].event_type, 'CONTRACT_DRAFTED');
    assert.equal(h.events[0].trust_level, 'STANDARD');
  });

  test('rejects missing contract_id', async () => {
    const svc = createContractService({ store: new InMemoryContractStore(), hooks: makeHooks() });
    await assert.rejects(() => svc.draftContract({ ...BASE_DRAFT, contract_id: '' }), /contract_id is required/);
  });

  test('rejects missing worker_id', async () => {
    const svc = createContractService({ store: new InMemoryContractStore(), hooks: makeHooks() });
    await assert.rejects(() => svc.draftContract({ ...BASE_DRAFT, worker_id: '' }), /worker_id is required/);
  });
});

describe('ContractService — transitionContract', () => {
  test('DRAFT → SIGNED emits CONTRACT_SIGNED with trust_level=HIGH', async () => {
    const h = makeHooks();
    const svc = createContractService({ store: new InMemoryContractStore(), hooks: h });
    await svc.draftContract(BASE_DRAFT);
    const updated = await svc.transitionContract({
      contract_id:    BASE_DRAFT.contract_id,
      next_status:    'SIGNED',
      updated_at:     '2026-03-07T02:00:00Z',
      event_id:       '99999999-9999-9999-9999-999999999999',
      occurred_at:    '2026-03-07T02:00:00Z',
      actor:          { actor_type: 'HUMAN', actor_id: 'u-worker' },
      correlation_id: 'corr-s',
      causation_id:   'caus-s',
    });
    assert.equal(updated.status, 'SIGNED');
    const signedEvt = h.events.find(e => e.event_type === 'CONTRACT_SIGNED');
    assert.ok(signedEvt);
    assert.equal(signedEvt.trust_level, 'HIGH');
    assert.equal(signedEvt.requires_approval, true);
  });

  test('SIGNED → ACTIVATED emits CONTRACT_ACTIVATED with trust_level=HIGH', async () => {
    const h = makeHooks();
    const svc = createContractService({ store: new InMemoryContractStore(), hooks: h });
    await svc.draftContract(BASE_DRAFT);
    await svc.transitionContract({ contract_id: BASE_DRAFT.contract_id, next_status: 'SIGNED', updated_at: 'x' });
    const updated = await svc.transitionContract({
      contract_id:    BASE_DRAFT.contract_id,
      next_status:    'ACTIVATED',
      updated_at:     '2026-03-07T03:00:00Z',
      event_id:       'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      occurred_at:    '2026-03-07T03:00:00Z',
      actor:          { actor_type: 'HUMAN', actor_id: 'u-hr' },
      correlation_id: 'corr-a',
      causation_id:   'caus-a',
    });
    assert.equal(updated.status, 'ACTIVATED');
    const activatedEvt = h.events.find(e => e.event_type === 'CONTRACT_ACTIVATED');
    assert.ok(activatedEvt);
    assert.equal(activatedEvt.trust_level, 'HIGH');
  });

  test('invalid transition throws', async () => {
    const h = makeHooks();
    const svc = createContractService({ store: new InMemoryContractStore(), hooks: h });
    await svc.draftContract(BASE_DRAFT);
    await assert.rejects(
      () => svc.transitionContract({ contract_id: BASE_DRAFT.contract_id, next_status: 'ACTIVATED', updated_at: 'x' }),
      /invalid contract transition: DRAFT -> ACTIVATED/,
    );
  });

  test('DRAFT → REVIEW has no trust event (intermediate)', async () => {
    const h = makeHooks();
    const svc = createContractService({ store: new InMemoryContractStore(), hooks: h });
    await svc.draftContract(BASE_DRAFT);
    const updated = await svc.transitionContract({ contract_id: BASE_DRAFT.contract_id, next_status: 'REVIEW', updated_at: 'x' });
    assert.equal(updated.status, 'REVIEW');
    // Only CONTRACT_DRAFTED was emitted (no trust event for REVIEW transition)
    assert.equal(h.events.filter(e => e.trust_level === 'HIGH').length, 0);
  });
});

describe('ContractService — getContract', () => {
  test('returns contract by id', async () => {
    const svc = createContractService({ store: new InMemoryContractStore(), hooks: makeHooks() });
    await svc.draftContract(BASE_DRAFT);
    const c = await svc.getContract(BASE_DRAFT.contract_id);
    assert.equal(c.contract_id, BASE_DRAFT.contract_id);
  });

  test('returns null for unknown id', async () => {
    const svc = createContractService({ store: new InMemoryContractStore(), hooks: makeHooks() });
    assert.equal(await svc.getContract('unknown'), null);
  });
});
