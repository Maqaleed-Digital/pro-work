'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createDashboardProjection, InMemoryDashboardStore, defaultState, HANDLED_EVENT_TYPES } = require('../app/modules/wos/projections/dashboard');
const { createWosCore } = require('../app/modules/wos');
const { createEventPublisher, InMemoryEventStore } = require('../app/modules/event_bus');
const { createExecutionEventHooks } = require('../app/modules/execution_engine/event_hooks');

function makeProjection() {
  const store = new InMemoryDashboardStore();
  const proj  = createDashboardProjection({ store });
  return { proj, store };
}

function fakeEvent(event_type, tenant_id = 't1', occurred_at = '2026-03-06T12:00:00Z') {
  return { event_id: `ev-${Math.random()}`, event_type, tenant_id, occurred_at };
}

test('createDashboardProjection throws without store', () => {
  assert.throws(() => createDashboardProjection({}), /store is required/);
});

test('getState returns default zero state for unknown tenant', () => {
  const { proj } = makeProjection();
  const state = proj.getState('nobody');
  assert.equal(state.project_count, 0);
  assert.equal(state.milestone_open_count, 0);
  assert.equal(state.last_event_at, null);
});

test('HANDLED_EVENT_TYPES contains expected events', () => {
  assert.ok(HANDLED_EVENT_TYPES.includes('PROJECT_CREATED'));
  assert.ok(HANDLED_EVENT_TYPES.includes('MILESTONE_COMPLETED'));
  assert.ok(HANDLED_EVENT_TYPES.includes('EXECUTION_JOB_COMPLETED'));
});

test('apply PROJECT_CREATED increments project_count', () => {
  const { proj } = makeProjection();
  proj.apply(fakeEvent('PROJECT_CREATED'));
  assert.equal(proj.getState('t1').project_count, 1);
  proj.apply(fakeEvent('PROJECT_CREATED'));
  assert.equal(proj.getState('t1').project_count, 2);
});

test('apply WORKSTREAM_CREATED increments workstream_count', () => {
  const { proj } = makeProjection();
  proj.apply(fakeEvent('WORKSTREAM_CREATED'));
  assert.equal(proj.getState('t1').workstream_count, 1);
});

test('apply MILESTONE_CREATED increments milestone_open_count', () => {
  const { proj } = makeProjection();
  proj.apply(fakeEvent('MILESTONE_CREATED'));
  assert.equal(proj.getState('t1').milestone_open_count, 1);
});

test('apply MILESTONE_COMPLETED decrements open and increments completed', () => {
  const { proj } = makeProjection();
  proj.apply(fakeEvent('MILESTONE_CREATED'));
  proj.apply(fakeEvent('MILESTONE_CREATED'));
  proj.apply(fakeEvent('MILESTONE_COMPLETED'));
  const state = proj.getState('t1');
  assert.equal(state.milestone_open_count, 1);
  assert.equal(state.milestone_completed_count, 1);
});

test('milestone_open_count never goes below 0', () => {
  const { proj } = makeProjection();
  proj.apply(fakeEvent('MILESTONE_COMPLETED'));
  assert.equal(proj.getState('t1').milestone_open_count, 0);
});

test('apply EXECUTION_JOB_COMPLETED increments counter', () => {
  const { proj } = makeProjection();
  proj.apply(fakeEvent('EXECUTION_JOB_COMPLETED'));
  assert.equal(proj.getState('t1').execution_job_completed_count, 1);
});

test('apply unknown event type is a no-op', () => {
  const { proj } = makeProjection();
  proj.apply(fakeEvent('SOME_UNKNOWN_EVENT'));
  const state = proj.getState('t1');
  assert.equal(state.project_count, 0);
});

test('projection tracks last_event_id, last_event_type, last_event_at', () => {
  const { proj } = makeProjection();
  const event = { event_id: 'ev-abc', event_type: 'PROJECT_CREATED', tenant_id: 't1', occurred_at: '2026-03-06T10:00:00Z' };
  proj.apply(event);
  const state = proj.getState('t1');
  assert.equal(state.last_event_id, 'ev-abc');
  assert.equal(state.last_event_type, 'PROJECT_CREATED');
  assert.equal(state.last_event_at, '2026-03-06T10:00:00Z');
});

test('projection is tenant-scoped — t1 events do not affect t2', () => {
  const { proj } = makeProjection();
  proj.apply(fakeEvent('PROJECT_CREATED', 't1'));
  proj.apply(fakeEvent('PROJECT_CREATED', 't1'));
  proj.apply(fakeEvent('PROJECT_CREATED', 't2'));
  assert.equal(proj.getState('t1').project_count, 2);
  assert.equal(proj.getState('t2').project_count, 1);
});

test('rebuild replays a sequence of events correctly', () => {
  const { proj } = makeProjection();
  const events = [
    fakeEvent('PROJECT_CREATED', 't1'),
    fakeEvent('WORKSTREAM_CREATED', 't1'),
    fakeEvent('MILESTONE_CREATED', 't1'),
    fakeEvent('MILESTONE_CREATED', 't1'),
    fakeEvent('MILESTONE_COMPLETED', 't1'),
  ];
  proj.rebuild(events);
  const state = proj.getState('t1');
  assert.equal(state.project_count, 1);
  assert.equal(state.workstream_count, 1);
  assert.equal(state.milestone_open_count, 1);
  assert.equal(state.milestone_completed_count, 1);
});

test('end-to-end: WOS core + event hooks updates projection', async () => {
  const eventStore = new InMemoryEventStore();
  const publisher  = createEventPublisher({ eventStore });
  const hooks      = createExecutionEventHooks({ publisher });

  const dashStore = new InMemoryDashboardStore();
  const dashboard = createDashboardProjection({ store: dashStore });
  const wos       = createWosCore({ hooks });

  const p  = await wos.projects.create({ tenant_id: 't1', owner_user_id: 'u1', title: 'Sprint A Project' });
  const ws = await wos.workstreams.create({ tenant_id: 't1', project_id: p.project_id, stream_name: 'Core', created_by: 'u1' });
  const m  = await wos.milestones.create({ tenant_id: 't1', workstream_id: ws.workstream_id, project_id: p.project_id, title: 'MVP', created_by: 'u1' });

  // Apply events to projection
  const events = await eventStore.all();
  dashboard.rebuild(events);

  let state = dashboard.getState('t1');
  assert.equal(state.project_count, 1);
  assert.equal(state.workstream_count, 1);
  assert.equal(state.milestone_open_count, 1);
  assert.equal(state.milestone_completed_count, 0);

  // Complete milestone
  await wos.milestones.complete(m.milestone_id, {
    approval_record_id: 'apr-1', evidence_pack_id: 'ep-1',
    completed_by_actor_type: 'HUMAN', completed_by_actor_id: 'u1',
  });

  // Apply new events
  const allEvents = await eventStore.all();
  const dashStore2 = new InMemoryDashboardStore();
  const dashboard2 = createDashboardProjection({ store: dashStore2 });
  dashboard2.rebuild(allEvents);

  state = dashboard2.getState('t1');
  assert.equal(state.milestone_open_count, 0);
  assert.equal(state.milestone_completed_count, 1);
});
