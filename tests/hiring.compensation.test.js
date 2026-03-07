'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { createCompensationService } = require('../app/modules/hiring/compensation_service');

function makeHooks() {
  const events = [];
  return { events, publish: async (e) => events.push(e) };
}

describe('CompensationService — validateCompensation', () => {
  test('validates package and emits OFFER_COMPENSATION_VALIDATED (STANDARD)', async () => {
    const h = makeHooks();
    const svc = createCompensationService({ hooks: h });
    const result = await svc.validateCompensation({
      id:          'offer-1',
      tenant_id:   '22222222-2222-2222-2222-222222222222',
      base_salary: 15000,
      currency:    'SAR',
      allowances:  [{ type: 'HOUSING', amount: 3000 }],
    });
    assert.equal(result.gross_amount, 18000);
    assert.equal(h.events[0].event_type, 'OFFER_COMPENSATION_VALIDATED');
    assert.equal(h.events[0].trust_level, 'STANDARD');
    assert.equal(h.events[0].requires_approval, false);
    assert.equal(h.events[0].payload.gross, 18000);
  });

  test('calculates gross with no allowances', async () => {
    const svc = createCompensationService({ hooks: makeHooks() });
    const result = await svc.validateCompensation({
      id: 'offer-2', tenant_id: 't1', base_salary: 10000, currency: 'SAR',
    });
    assert.equal(result.gross_amount, 10000);
  });

  test('calculates gross with multiple allowances', async () => {
    const svc = createCompensationService({ hooks: makeHooks() });
    const result = await svc.validateCompensation({
      id: 'offer-3', tenant_id: 't1', base_salary: 12000, currency: 'SAR',
      allowances: [{ amount: 2000 }, { amount: 1000 }],
    });
    assert.equal(result.gross_amount, 15000);
  });

  test('rejects non-positive base_salary', async () => {
    const svc = createCompensationService({ hooks: makeHooks() });
    await assert.rejects(
      () => svc.validateCompensation({ id: 'x', tenant_id: 't1', base_salary: 0, currency: 'SAR' }),
      /invalid salary/,
    );
  });

  test('rejects missing currency', async () => {
    const svc = createCompensationService({ hooks: makeHooks() });
    await assert.rejects(
      () => svc.validateCompensation({ id: 'x', tenant_id: 't1', base_salary: 1000, currency: '' }),
      /missing currency/,
    );
  });

  test('rejects missing id', async () => {
    const svc = createCompensationService({ hooks: makeHooks() });
    await assert.rejects(
      () => svc.validateCompensation({ id: '', tenant_id: 't1', base_salary: 1000, currency: 'SAR' }),
      /id is required/,
    );
  });

  test('auto-generates event_id when not provided', async () => {
    const h = makeHooks();
    const svc = createCompensationService({ hooks: h });
    await svc.validateCompensation({ id: 'offer-x', tenant_id: 't1', base_salary: 5000, currency: 'SAR' });
    assert.ok(h.events[0].event_id, 'event_id must be auto-generated');
  });
});
