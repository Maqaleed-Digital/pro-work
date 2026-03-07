'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { createChecklistService, InMemoryChecklistStore } = require('../app/modules/onboarding/checklist_service');

function makeHooks() {
  const events = [];
  return { events, publish: async (e) => events.push(e) };
}

const CASE_ID = '11111111-1111-1111-1111-111111111111';
const TENANT  = '22222222-2222-2222-2222-222222222222';
const WORKER  = '33333333-3333-3333-3333-333333333333';

describe('ChecklistService — startOnboarding', () => {
  test('emits ONBOARDING_STARTED and returns case', async () => {
    const h = makeHooks();
    const svc = createChecklistService({ store: new InMemoryChecklistStore(), hooks: h });
    const out = await svc.startOnboarding({
      onboarding_case_id: CASE_ID,
      worker_id:          WORKER,
      tenant_id:          TENANT,
      event_id:           'ev-1',
      occurred_at:        '2026-03-07T01:00:00Z',
      actor:              { actor_type: 'HUMAN', actor_id: 'u-hr' },
      correlation_id:     'corr-1',
      causation_id:       'caus-1',
    });
    assert.equal(out.onboarding_case_id, CASE_ID);
    assert.equal(out.checklist_template, 'DEFAULT_KSA');
    assert.equal(h.events[0].event_type, 'ONBOARDING_STARTED');
    assert.equal(h.events[0].trust_level, 'STANDARD');
  });

  test('rejects missing onboarding_case_id', async () => {
    const svc = createChecklistService({ store: new InMemoryChecklistStore(), hooks: makeHooks() });
    await assert.rejects(() => svc.startOnboarding({ worker_id: WORKER }), /onboarding_case_id is required/);
  });
});

describe('ChecklistService — createChecklistItem', () => {
  test('creates item with PENDING status', async () => {
    const svc = createChecklistService({ store: new InMemoryChecklistStore(), hooks: makeHooks() });
    const item = await svc.createChecklistItem({
      checklist_item_id:  'item-1',
      onboarding_case_id: CASE_ID,
      title:              'Capture IBAN',
      created_at:         '2026-03-07T01:00:00Z',
    });
    assert.equal(item.status, 'PENDING');
    assert.equal(item.item_type, 'TASK');
  });

  test('rejects missing title', async () => {
    const svc = createChecklistService({ store: new InMemoryChecklistStore(), hooks: makeHooks() });
    await assert.rejects(
      () => svc.createChecklistItem({ checklist_item_id: 'i1', onboarding_case_id: CASE_ID, title: '' }),
      /title is required/,
    );
  });
});

describe('ChecklistService — completeChecklistItem', () => {
  test('completes item and emits ONBOARDING_CHECKLIST_ITEM_COMPLETED', async () => {
    const h = makeHooks();
    const svc = createChecklistService({ store: new InMemoryChecklistStore(), hooks: h });
    await svc.createChecklistItem({ checklist_item_id: 'item-1', onboarding_case_id: CASE_ID, title: 'Sign contract', created_at: '2026-03-07T01:00:00Z' });

    const out = await svc.completeChecklistItem({
      checklist_item_id: 'item-1',
      completed_by:      'u-hr',
      completed_at:      '2026-03-07T01:20:00Z',
      tenant_id:         TENANT,
      event_id:          'ev-2',
      occurred_at:       '2026-03-07T01:20:00Z',
      actor:             { actor_type: 'HUMAN', actor_id: 'u-hr' },
      correlation_id:    'corr-2',
      causation_id:      'caus-2',
    });

    assert.equal(out.status, 'COMPLETED');
    assert.equal(h.events[0].event_type, 'ONBOARDING_CHECKLIST_ITEM_COMPLETED');
    assert.equal(h.events[0].trust_level, 'STANDARD');
  });

  test('listCaseChecklist returns items for case', async () => {
    const svc = createChecklistService({ store: new InMemoryChecklistStore(), hooks: makeHooks() });
    await svc.createChecklistItem({ checklist_item_id: 'i1', onboarding_case_id: CASE_ID, title: 'A', created_at: 'x' });
    await svc.createChecklistItem({ checklist_item_id: 'i2', onboarding_case_id: CASE_ID, title: 'B', created_at: 'x' });
    await svc.createChecklistItem({ checklist_item_id: 'i3', onboarding_case_id: 'other', title: 'C', created_at: 'x' });
    const items = await svc.listCaseChecklist(CASE_ID);
    assert.equal(items.length, 2);
  });
});
