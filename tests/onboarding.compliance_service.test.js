'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { createComplianceService, InMemoryComplianceStore, validateIban } = require('../app/modules/onboarding/compliance_service');

function makeHooks() {
  const events = [];
  return { events, publish: async (e) => events.push(e) };
}

const WORKER_ID  = '11111111-1111-1111-1111-111111111111';
const CASE_ID    = '22222222-2222-2222-2222-222222222222';
const TENANT_ID  = '33333333-3333-3333-3333-333333333333';

describe('validateIban', () => {
  test('accepts valid Saudi IBAN (24 chars)', () => {
    assert.equal(validateIban('SA0380000000608010167519'), true);
  });
  test('rejects short string', () => {
    assert.equal(validateIban('SA123'), false);
  });
  test('rejects non-string', () => {
    assert.equal(validateIban(12345), false);
  });
});

describe('ComplianceService — captureIban', () => {
  test('stores IBAN and emits IBAN_CAPTURED (STANDARD)', async () => {
    const h = makeHooks();
    const svc = createComplianceService({ store: new InMemoryComplianceStore(), hooks: h });
    const out = await svc.captureIban({
      worker_id:          WORKER_ID,
      onboarding_case_id: CASE_ID,
      tenant_id:          TENANT_ID,
      iban:               'SA0380000000608010167519',
      event_id:           '44444444-4444-4444-4444-444444444444',
      occurred_at:        '2026-03-07T01:00:00Z',
      updated_at:         '2026-03-07T01:00:00Z',
      actor:              { actor_type: 'HUMAN', actor_id: '55555555-5555-5555-5555-555555555555' },
      correlation_id:     '66666666-6666-6666-6666-666666666666',
      causation_id:       '77777777-7777-7777-7777-777777777777',
    });
    assert.equal(out.bank_confirmation_status, 'PENDING');
    assert.equal(h.events[0].event_type, 'IBAN_CAPTURED');
    assert.equal(h.events[0].trust_level, 'STANDARD');
  });

  test('rejects invalid IBAN', async () => {
    const svc = createComplianceService({ store: new InMemoryComplianceStore(), hooks: makeHooks() });
    await assert.rejects(
      () => svc.captureIban({ worker_id: WORKER_ID, iban: 'BAD', onboarding_case_id: CASE_ID }),
      /valid iban is required/,
    );
  });
});

describe('ComplianceService — generateWpsReadiness', () => {
  test('generates artifact and emits WPS_READINESS_GENERATED (HIGH)', async () => {
    const h = makeHooks();
    const svc = createComplianceService({ store: new InMemoryComplianceStore(), hooks: h });
    const out = await svc.generateWpsReadiness({
      artifact_id:        '88888888-8888-8888-8888-888888888888',
      worker_id:          WORKER_ID,
      onboarding_case_id: CASE_ID,
      tenant_id:          TENANT_ID,
      salary_lines:       [{ component: 'BASE', amount: 12000 }],
      approver_ids:       ['99999999-9999-9999-9999-999999999999'],
      generated_at:       '2026-03-07T01:30:00Z',
      event_id:           'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      occurred_at:        '2026-03-07T01:30:00Z',
      actor:              { actor_type: 'HUMAN', actor_id: '55555555-5555-5555-5555-555555555555' },
      correlation_id:     'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
      causation_id:       'cccccccc-cccc-cccc-cccc-cccccccccccc',
    });
    assert.equal(out.structure_valid, true);
    assert.equal(out.line_count, 1);
    assert.equal(h.events[0].event_type, 'WPS_READINESS_GENERATED');
    assert.equal(h.events[0].trust_level, 'HIGH');
    assert.equal(h.events[0].requires_approval, true);
  });

  test('structure_valid=false when salary_lines is empty', async () => {
    const svc = createComplianceService({ store: new InMemoryComplianceStore(), hooks: makeHooks() });
    const out = await svc.generateWpsReadiness({
      artifact_id: 'a', worker_id: WORKER_ID, onboarding_case_id: CASE_ID, tenant_id: TENANT_ID,
      salary_lines: [], generated_at: 'x',
    });
    assert.equal(out.structure_valid, false);
  });

  test('rejects non-array salary_lines', async () => {
    const svc = createComplianceService({ store: new InMemoryComplianceStore(), hooks: makeHooks() });
    await assert.rejects(
      () => svc.generateWpsReadiness({ worker_id: WORKER_ID, onboarding_case_id: CASE_ID, salary_lines: 'bad' }),
      /salary_lines must be an array/,
    );
  });
});
