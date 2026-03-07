'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { createHiringCaseService, InMemoryHiringCaseStore } = require('../app/modules/hiring/hiring_case_service');

function makeHooks() {
  const events = [];
  return { events, publish: async (e) => events.push(e) };
}

const BASE = {
  tenant_id:      '22222222-2222-2222-2222-222222222222',
  candidate_id:   'c1',
  requisition_id: 'r1',
};

describe('HiringCaseService — openHiringCase', () => {
  test('opens a case in SCREENED and emits HIRING_CASE_OPENED (STANDARD)', async () => {
    const h = makeHooks();
    const svc = createHiringCaseService({ store: new InMemoryHiringCaseStore(), hooks: h });
    const rec = await svc.openHiringCase(BASE);
    assert.equal(rec.status, 'SCREENED');
    assert.ok(rec.id, 'id must be auto-generated UUID');
    assert.equal(rec.tenant_id,      BASE.tenant_id);
    assert.equal(rec.candidate_id,   BASE.candidate_id);
    assert.equal(rec.requisition_id, BASE.requisition_id);
    assert.equal(h.events.length, 1);
    assert.equal(h.events[0].event_type, 'HIRING_CASE_OPENED');
    assert.equal(h.events[0].trust_level, 'STANDARD');
    assert.equal(h.events[0].requires_approval, false);
    assert.equal(h.events[0].payload.id, rec.id);
  });

  test('auto-generates event_id and occurred_at when not provided', async () => {
    const h = makeHooks();
    const svc = createHiringCaseService({ store: new InMemoryHiringCaseStore(), hooks: h });
    await svc.openHiringCase(BASE);
    assert.ok(h.events[0].event_id, 'event_id must be auto-generated');
    assert.ok(h.events[0].occurred_at, 'occurred_at must be auto-generated');
  });

  test('rejects missing tenant_id', async () => {
    const svc = createHiringCaseService({ store: new InMemoryHiringCaseStore(), hooks: makeHooks() });
    await assert.rejects(() => svc.openHiringCase({ ...BASE, tenant_id: '' }), /tenant_id is required/);
  });

  test('rejects missing candidate_id', async () => {
    const svc = createHiringCaseService({ store: new InMemoryHiringCaseStore(), hooks: makeHooks() });
    await assert.rejects(() => svc.openHiringCase({ ...BASE, candidate_id: '' }), /candidate_id is required/);
  });

  test('rejects missing requisition_id', async () => {
    const svc = createHiringCaseService({ store: new InMemoryHiringCaseStore(), hooks: makeHooks() });
    await assert.rejects(() => svc.openHiringCase({ ...BASE, requisition_id: '' }), /requisition_id is required/);
  });

  test('each case gets a unique id', async () => {
    const svc = createHiringCaseService({ store: new InMemoryHiringCaseStore(), hooks: makeHooks() });
    const a = await svc.openHiringCase(BASE);
    const b = await svc.openHiringCase(BASE);
    assert.notEqual(a.id, b.id);
  });
});

describe('HiringCaseService — recordDecision', () => {
  test('records decision and emits HIRING_DECISION_RECORDED (HIGH)', async () => {
    const h = makeHooks();
    const svc = createHiringCaseService({ store: new InMemoryHiringCaseStore(), hooks: h });
    const rec = await svc.openHiringCase(BASE);

    const updated = await svc.recordDecision({ case_id: rec.id, decision: 'HIRED' });
    assert.equal(updated.status, 'HIRED');
    const evt = h.events.find(e => e.event_type === 'HIRING_DECISION_RECORDED');
    assert.ok(evt);
    assert.equal(evt.trust_level, 'HIGH');
    assert.equal(evt.requires_approval, true);
    assert.equal(evt.payload.decision, 'HIRED');
    assert.equal(evt.aggregate_id, rec.id);
  });

  test('records NOT_HIRED decision', async () => {
    const svc = createHiringCaseService({ store: new InMemoryHiringCaseStore(), hooks: makeHooks() });
    const rec = await svc.openHiringCase(BASE);
    const updated = await svc.recordDecision({ case_id: rec.id, decision: 'NOT_HIRED' });
    assert.equal(updated.status, 'NOT_HIRED');
  });

  test('throws on unknown case_id', async () => {
    const svc = createHiringCaseService({ store: new InMemoryHiringCaseStore(), hooks: makeHooks() });
    await assert.rejects(() => svc.recordDecision({ case_id: 'missing', decision: 'HIRED' }), /not found/);
  });

  test('rejects missing decision', async () => {
    const svc = createHiringCaseService({ store: new InMemoryHiringCaseStore(), hooks: makeHooks() });
    const rec = await svc.openHiringCase(BASE);
    await assert.rejects(() => svc.recordDecision({ case_id: rec.id, decision: '' }), /decision is required/);
  });
});

describe('HiringCaseService — getCase / listCases', () => {
  test('getCase returns stored case', async () => {
    const svc = createHiringCaseService({ store: new InMemoryHiringCaseStore(), hooks: makeHooks() });
    const rec = await svc.openHiringCase(BASE);
    const found = await svc.getCase(rec.id);
    assert.equal(found.id, rec.id);
  });

  test('listCases returns all', async () => {
    const svc = createHiringCaseService({ store: new InMemoryHiringCaseStore(), hooks: makeHooks() });
    await svc.openHiringCase(BASE);
    await svc.openHiringCase(BASE);
    assert.equal((await svc.listCases()).length, 2);
  });
});
