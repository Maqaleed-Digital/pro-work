'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createEventPublisher, InMemoryEventStore } = require('../app/modules/event_bus');
const { createTrustConsumer, InMemoryLedgerStore } = require('../app/modules/trust_engine/trust_consumer');

test('OFFBOARDING_COMPLETED flows into trust ledger', async () => {
  const publisher = createEventPublisher({ eventStore: new InMemoryEventStore() });
  const trust = createTrustConsumer({ ledgerStore: new InMemoryLedgerStore() });

  const event = await publisher.publish({
    event_id: '11111111-1111-1111-1111-111111111111',
    event_type: 'OFFBOARDING_COMPLETED',
    event_version: '1.0',
    occurred_at: '2026-03-07T16:00:00Z',
    tenant_id: '22222222-2222-2222-2222-222222222222',
    aggregate_type: 'OFFBOARDING_CASE',
    aggregate_id: '33333333-3333-3333-3333-333333333333',
    actor: { actor_type: 'HUMAN', actor_id: '44444444-4444-4444-4444-444444444444' },
    correlation_id: '55555555-5555-5555-5555-555555555555',
    causation_id: '66666666-6666-6666-6666-666666666666',
    source: { service: 'lifecycle', module: 'offboarding_service', environment: 'test' },
    trust_level: 'HIGH',
    requires_approval: true,
    payload: {
      offboarding_case_id: '33333333-3333-3333-3333-333333333333',
      worker_id: '77777777-7777-7777-7777-777777777777',
      status: 'COMPLETED'
    },
    metadata: {}
  });

  const result = await trust.process(event);
  assert.equal(result.processed, true);
});
