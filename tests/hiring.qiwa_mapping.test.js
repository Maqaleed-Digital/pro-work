'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { createQiwaMappingService } = require('../app/modules/hiring/qiwa_mapping_service');

function makeHooks() {
  const events = [];
  return { events, publish: async (e) => events.push(e) };
}

describe('QiwaMappingService — mapContract', () => {
  test('maps contract with full payload (parity 100) and emits CONTRACT_MIRROR_MAPPED (HIGH)', async () => {
    const h = makeHooks();
    const svc = createQiwaMappingService({ hooks: h });
    const result = await svc.mapContract({
      case_id:    'case-1',
      tenant_id:  '22222222-2222-2222-2222-222222222222',
      role_title: 'Software Engineer',
    });
    assert.equal(result.parity_score, 100);
    assert.deepEqual(result.missing, []);
    assert.equal(h.events[0].event_type,       'CONTRACT_MIRROR_MAPPED');
    assert.equal(h.events[0].trust_level,      'HIGH');
    assert.equal(h.events[0].requires_approval, true);
    assert.equal(h.events[0].aggregate_type,   'HIRING_CASE');
    assert.equal(h.events[0].aggregate_id,     'case-1');
    assert.equal(h.events[0].payload.parity_score, 100);
    assert.deepEqual(h.events[0].payload.missing, []);
  });

  test('maps contract with missing role_title (parity 60)', async () => {
    const h = makeHooks();
    const svc = createQiwaMappingService({ hooks: h });
    const result = await svc.mapContract({
      case_id:   'case-2',
      tenant_id: 't1',
    });
    assert.equal(result.parity_score, 60);
    assert.ok(result.missing.includes('role_title'));
    assert.equal(h.events[0].payload.parity_score, 60);
    assert.ok(h.events[0].payload.missing.includes('role_title'));
  });

  test('rejects missing case_id', async () => {
    const svc = createQiwaMappingService({ hooks: makeHooks() });
    await assert.rejects(() => svc.mapContract({ case_id: '', tenant_id: 't1' }), /case_id is required/);
  });

  test('auto-generates event_id when not provided', async () => {
    const h = makeHooks();
    const svc = createQiwaMappingService({ hooks: h });
    await svc.mapContract({ case_id: 'case-3', tenant_id: 't1', role_title: 'Analyst' });
    assert.ok(h.events[0].event_id, 'event_id must be auto-generated');
  });
});
