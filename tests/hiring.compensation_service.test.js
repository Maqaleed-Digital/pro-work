'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { createCompensationService, InMemoryCompensationStore } = require('../app/modules/hiring/compensation_service');

function makeHooks() {
  const events = [];
  return { events, publish: async (e) => events.push(e) };
}

const BASE = {
  package_id:     '11111111-1111-1111-1111-111111111111',
  tenant_id:      '22222222-2222-2222-2222-222222222222',
  requisition_id: '33333333-3333-3333-3333-333333333333',
  candidate_id:   '44444444-4444-4444-4444-444444444444',
  base_salary:    15000,
  currency:       'SAR',
  allowances:     [{ type: 'HOUSING', amount: 3000 }],
  created_at:     '2026-03-07T05:00:00Z',
  event_id:       '55555555-5555-5555-5555-555555555555',
  occurred_at:    '2026-03-07T05:00:00Z',
  actor:          { actor_type: 'HUMAN', actor_id: '66666666-6666-6666-6666-666666666666' },
  correlation_id: '77777777-7777-7777-7777-777777777777',
  causation_id:   '88888888-8888-8888-8888-888888888888',
};

describe('CompensationService — draftPackage', () => {
  test('creates package in DRAFT and emits COMPENSATION_PACKAGE_DRAFTED (STANDARD)', async () => {
    const h = makeHooks();
    const svc = createCompensationService({ store: new InMemoryCompensationStore(), hooks: h });
    const pkg = await svc.draftPackage(BASE);
    assert.equal(pkg.status, 'DRAFT');
    assert.equal(pkg.currency, 'SAR');
    assert.equal(pkg.allowances.length, 1);
    assert.equal(h.events[0].event_type, 'COMPENSATION_PACKAGE_DRAFTED');
    assert.equal(h.events[0].trust_level, 'STANDARD');
    assert.equal(h.events[0].requires_approval, false);
  });

  test('defaults currency to SAR', async () => {
    const svc = createCompensationService({ store: new InMemoryCompensationStore(), hooks: makeHooks() });
    const pkg = await svc.draftPackage({ ...BASE, currency: undefined });
    assert.equal(pkg.currency, 'SAR');
  });

  test('rejects missing package_id', async () => {
    const svc = createCompensationService({ store: new InMemoryCompensationStore(), hooks: makeHooks() });
    await assert.rejects(() => svc.draftPackage({ ...BASE, package_id: '' }), /package_id is required/);
  });

  test('rejects non-positive base_salary', async () => {
    const svc = createCompensationService({ store: new InMemoryCompensationStore(), hooks: makeHooks() });
    await assert.rejects(() => svc.draftPackage({ ...BASE, base_salary: 0 }), /base_salary must be a positive number/);
  });
});

describe('CompensationService — approvePackage', () => {
  test('approves DRAFT package and emits COMPENSATION_PACKAGE_APPROVED (HIGH)', async () => {
    const h = makeHooks();
    const svc = createCompensationService({ store: new InMemoryCompensationStore(), hooks: h });
    await svc.draftPackage(BASE);

    const updated = await svc.approvePackage({
      package_id:  BASE.package_id,
      approved_by: 'u-cfo',
      approved_at: '2026-03-07T06:00:00Z',
      event_id:    '99999999-9999-9999-9999-999999999999',
      occurred_at: '2026-03-07T06:00:00Z',
      actor:       { actor_type: 'HUMAN', actor_id: 'u-cfo' },
      correlation_id: 'corr-a', causation_id: 'caus-a',
    });

    assert.equal(updated.status, 'APPROVED');
    assert.equal(updated.approved_by, 'u-cfo');
    const evt = h.events.find(e => e.event_type === 'COMPENSATION_PACKAGE_APPROVED');
    assert.ok(evt);
    assert.equal(evt.trust_level, 'HIGH');
    assert.equal(evt.requires_approval, true);
  });

  test('rejects approving non-DRAFT package', async () => {
    const h = makeHooks();
    const svc = createCompensationService({ store: new InMemoryCompensationStore(), hooks: h });
    await svc.draftPackage(BASE);
    await svc.approvePackage({ package_id: BASE.package_id, approved_by: 'u', approved_at: 'x', event_id: 'e1', occurred_at: 'x', actor: { actor_type: 'HUMAN', actor_id: 'u' }, correlation_id: 'c', causation_id: 'c' });
    await assert.rejects(
      () => svc.approvePackage({ package_id: BASE.package_id, approved_by: 'u', approved_at: 'x' }),
      /must be in DRAFT to approve/,
    );
  });

  test('throws when package not found', async () => {
    const svc = createCompensationService({ store: new InMemoryCompensationStore(), hooks: makeHooks() });
    await assert.rejects(() => svc.approvePackage({ package_id: 'missing', approved_by: 'u' }), /not found/);
  });
});

describe('CompensationService — getPackage / listPackages', () => {
  test('getPackage returns stored package', async () => {
    const svc = createCompensationService({ store: new InMemoryCompensationStore(), hooks: makeHooks() });
    await svc.draftPackage(BASE);
    const pkg = await svc.getPackage(BASE.package_id);
    assert.equal(pkg.package_id, BASE.package_id);
  });

  test('listPackages returns all', async () => {
    const svc = createCompensationService({ store: new InMemoryCompensationStore(), hooks: makeHooks() });
    await svc.draftPackage(BASE);
    await svc.draftPackage({ ...BASE, package_id: 'pkg-2', event_id: 'ev-2' });
    assert.equal((await svc.listPackages()).length, 2);
  });
});
