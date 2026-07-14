'use strict';

const test   = require('node:test');
const assert = require('node:assert/strict');
const fs     = require('fs');
const path   = require('path');

const { createVeritasForwardingPublisher, WHITELIST } =
  require('../app/modules/event_bus/veritas_forwarder');
const { InMemoryEventStore } = require('../app/modules/event_bus');
const { memoryTransport, noopTransport } =
  require('../app/modules/event_bus/veritas/transport');

// ── Sponsor Ruling: validate emitted events against the vendored schema.
// Read schema at test time so the assertions track the contract file.
const SCHEMA = JSON.parse(
  fs.readFileSync(
    path.join(__dirname, '../app/modules/event_bus/veritas/schema.json'),
    'utf8'
  )
);

function assertMatchesSchema(ev) {
  // Required attributes present.
  for (const key of SCHEMA.required) {
    assert.ok(ev[key] !== undefined && ev[key] !== null, `missing required attribute: ${key}`);
  }
  // Enums.
  const enums = {
    source_platform:      SCHEMA.properties.source_platform.enum,
    classification:       SCHEMA.properties.classification.enum,
    consent_state:        SCHEMA.properties.consent_state.enum,
    outcome:              SCHEMA.properties.outcome.enum,
    event_class:          SCHEMA.properties.event_class.enum,
    mode:                 SCHEMA.properties.mode.enum,
  };
  for (const [key, allowed] of Object.entries(enums)) {
    assert.ok(allowed.includes(ev[key]), `${key}="${ev[key]}" not in enum`);
  }
  // event_timestamp is parseable ISO.
  assert.ok(!Number.isNaN(Date.parse(ev.event_timestamp)), 'event_timestamp must be ISO-8601');
  // event_id minLength 8.
  assert.ok(typeof ev.event_id === 'string' && ev.event_id.length >= 8, 'event_id too short');
}

// Build an internal envelope that the publisher will accept. Keep this in
// lockstep with tests/event_bus.publisher.test.js — same shape, swapped type.
function internalEvent(eventType, payload, overrides = {}) {
  return {
    event_id:       '11111111-1111-1111-1111-111111111111',
    event_type:     eventType,
    event_version:  '1.0',
    occurred_at:    '2026-05-31T12:00:00Z',
    tenant_id:      '22222222-2222-2222-2222-222222222222',
    aggregate_type: aggregateTypeFor(eventType),
    aggregate_id:   '33333333-3333-3333-3333-333333333333',
    actor:          { actor_type: 'HUMAN', actor_id: '44444444-4444-4444-4444-444444444444' },
    correlation_id: '55555555-5555-5555-5555-555555555555',
    causation_id:   '66666666-6666-6666-6666-666666666666',
    source:         { service: 'wc-test', module: 'forwarder-suite', environment: 'test' },
    trust_level:    'STANDARD',
    requires_approval: false,
    payload,
    metadata:       {},
    ...overrides,
  };
}

// Each whitelisted event type lives under a specific aggregate_type in
// schema_registry.js. Mirror those here so the existing publisher accepts
// the test event.
function aggregateTypeFor(eventType) {
  switch (eventType) {
    case 'ONBOARDING_STARTED':     return 'ONBOARDING_CASE';
    case 'CANDIDATE_MATCHED':      return 'REQUISITION';
    case 'CANDIDATE_SHORTLISTED':  return 'REQUISITION';
    default:                       return 'WORKER';
  }
}

// Real required-field payloads per app/modules/event_bus/schema_registry.js.
const PAYLOADS = {
  ONBOARDING_STARTED: {
    onboarding_case_id: 'oc-1',
    worker_id:          'w-1',
    checklist_template: 'standard-v1',
  },
  CANDIDATE_MATCHED: {
    requisition_id:      'r-1',
    candidate_id:        'c-1',
    final_score:         0.87,
    candidate_type:      'INTERNAL',
    missing_skill_count: 2,
  },
  CANDIDATE_SHORTLISTED: {
    requisition_id:    'r-1',
    candidate_id:      'c-1',
    shortlist_reason:  'top-3-fit',
    reviewer_outcome:  'shortlisted',
  },
};

// ── 1. The WHITELIST is EXACTLY the Sponsor-approved set ─────────────────────
test('WHITELIST is exactly the Sponsor-approved set (1/3/4)', () => {
  const approved = ['ONBOARDING_STARTED', 'CANDIDATE_MATCHED', 'CANDIDATE_SHORTLISTED'];
  const actual   = Object.keys(WHITELIST).sort();
  assert.deepEqual(actual, approved.sort(),
    `WHITELIST must equal Sponsor set exactly. Got ${JSON.stringify(actual)}, expected ${JSON.stringify(approved.sort())}`);
});

// ── 2. Mappings match the Ruling ─────────────────────────────────────────────
test('Whitelist mappings carry the Sponsor-ruled event_class and wc_event', () => {
  assert.equal(WHITELIST.ONBOARDING_STARTED.event_class,     'workflow_execution');
  assert.equal(WHITELIST.ONBOARDING_STARTED.wc_event,        'WORKCAPTAIN_ONBOARDING_STARTED');
  assert.equal(WHITELIST.CANDIDATE_MATCHED.event_class,      'agent_decision');
  assert.equal(WHITELIST.CANDIDATE_MATCHED.wc_event,         'WORKCAPTAIN_SCORE_GENERATED');
  assert.equal(WHITELIST.CANDIDATE_SHORTLISTED.event_class,  'agent_decision');
  assert.equal(WHITELIST.CANDIDATE_SHORTLISTED.wc_event,     'WORKCAPTAIN_SCORE_REVIEWED');
});

// ── 3. Forwarder ships the eight-attribute contract, Mode-D ──────────────────
test('Forwards ONBOARDING_STARTED as Mode-D, schema-valid VERITAS event', async () => {
  const transport = memoryTransport();
  const publisher = createVeritasForwardingPublisher({
    eventStore: new InMemoryEventStore(),
    transport,
  });

  await publisher.publish(internalEvent('ONBOARDING_STARTED', PAYLOADS.ONBOARDING_STARTED));

  // Forwarding is fire-and-forget; flush microtasks.
  await new Promise(resolve => setImmediate(resolve));

  assert.equal(transport.captured.length, 1, 'one VERITAS event forwarded');
  const v = transport.captured[0];
  assertMatchesSchema(v);
  assert.equal(v.mode, 'D');
  assert.equal(v.event_class, 'workflow_execution');
  assert.equal(v.source_platform, 'prowork');
  assert.equal(v.payload.wc_event, 'WORKCAPTAIN_ONBOARDING_STARTED');
  assert.equal(v.provenance.mode_d_tagged, true);
});

test('Forwards CANDIDATE_MATCHED as agent_decision', async () => {
  const transport = memoryTransport();
  const publisher = createVeritasForwardingPublisher({
    eventStore: new InMemoryEventStore(),
    transport,
  });

  await publisher.publish(internalEvent('CANDIDATE_MATCHED', PAYLOADS.CANDIDATE_MATCHED));
  await new Promise(resolve => setImmediate(resolve));

  assert.equal(transport.captured.length, 1);
  assertMatchesSchema(transport.captured[0]);
  assert.equal(transport.captured[0].event_class, 'agent_decision');
  assert.equal(transport.captured[0].payload.wc_event, 'WORKCAPTAIN_SCORE_GENERATED');
});

test('Forwards CANDIDATE_SHORTLISTED as agent_decision', async () => {
  const transport = memoryTransport();
  const publisher = createVeritasForwardingPublisher({
    eventStore: new InMemoryEventStore(),
    transport,
  });

  await publisher.publish(internalEvent('CANDIDATE_SHORTLISTED', PAYLOADS.CANDIDATE_SHORTLISTED));
  await new Promise(resolve => setImmediate(resolve));

  assert.equal(transport.captured.length, 1);
  assertMatchesSchema(transport.captured[0]);
  assert.equal(transport.captured[0].event_class, 'agent_decision');
  assert.equal(transport.captured[0].payload.wc_event, 'WORKCAPTAIN_SCORE_REVIEWED');
});

// ── 4. Non-whitelisted events are NOT forwarded ──────────────────────────────
test('Does NOT forward an internal event that is not on the whitelist', async () => {
  const transport = memoryTransport();
  const publisher = createVeritasForwardingPublisher({
    eventStore: new InMemoryEventStore(),
    transport,
  });

  // WORKER_STATUS_CHANGED is a real registered event (schema_registry.js:5).
  await publisher.publish(internalEvent(
    'WORKER_STATUS_CHANGED',
    { worker_id: 'w-1', previous_status: 'ACTIVE', next_status: 'ON_LEAVE' },
    { aggregate_type: 'WORKER' },
  ));
  await new Promise(resolve => setImmediate(resolve));

  assert.equal(transport.captured.length, 0, 'non-whitelisted event must not be forwarded');
});

// ── 5. Behaviour preservation: internal publish still happens on transport
//      failure; transport errors do NOT propagate ─────────────────────────────
test('Transport failures do not corrupt internal publish (behaviour preserved)', async () => {
  const failingTransport = {
    name: 'failing',
    publish() { throw new Error('transport down'); },
  };
  const store = new InMemoryEventStore();
  const publisher = createVeritasForwardingPublisher({
    eventStore: store,
    transport: failingTransport,
  });

  const persisted = await publisher.publish(internalEvent('ONBOARDING_STARTED', {
    onboarding_case_id: 'oc-2',
    worker_id:          'w-2',
    checklist_template: 'standard-v1',
  }));

  assert.equal(persisted.event_type, 'ONBOARDING_STARTED');
  const rows = await store.all();
  assert.equal(rows.length, 1, 'internal event persisted despite transport failure');
});

// ── 6. noopTransport is the safe default ─────────────────────────────────────
test('noopTransport receives but does not deliver (zero behaviour change)', async () => {
  const publisher = createVeritasForwardingPublisher({
    eventStore: new InMemoryEventStore(),
    transport: noopTransport(),
  });
  // Should not throw; nothing to assert except the absence of side effects.
  await publisher.publish(internalEvent('ONBOARDING_STARTED', {
    onboarding_case_id: 'oc-3',
    worker_id:          'w-3',
    checklist_template: 'standard-v1',
  }));
});
