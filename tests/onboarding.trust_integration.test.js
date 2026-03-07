'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { createEventPublisher, InMemoryEventStore } = require('../app/modules/event_bus/index');
const { createTrustConsumer, InMemoryLedgerStore }  = require('../app/modules/trust_engine/trust_consumer');
const { createDocumentService,   InMemoryDocumentStore   } = require('../app/modules/onboarding/document_service');
const { createComplianceService, InMemoryComplianceStore } = require('../app/modules/onboarding/compliance_service');
const { createContractService,   InMemoryContractStore   } = require('../app/modules/onboarding/contract_service');
const { createProbationService,  InMemoryProbationStore  } = require('../app/modules/onboarding/probation_service');

function makeStack() {
  const eventStore    = new InMemoryEventStore();
  const ledgerStore   = new InMemoryLedgerStore();
  const trustConsumer = createTrustConsumer({ ledgerStore });
  const basePublisher = createEventPublisher({ eventStore });
  const publisher = {
    async publish(event) {
      const stored = await basePublisher.publish(event);
      await trustConsumer.process(stored);
      return stored;
    },
  };
  const hooks = { publish: (e) => publisher.publish(e) };
  return { eventStore, ledgerStore, hooks };
}

const TENANT  = '22222222-2222-2222-2222-222222222222';
const CASE_ID = '33333333-3333-3333-3333-333333333333';
const WORKER  = '44444444-4444-4444-4444-444444444444';
const ACTOR   = { actor_type: 'HUMAN', actor_id: '55555555-5555-5555-5555-555555555555' };

describe('Trust Integration — DOCUMENT_VERIFIED flows to ledger', () => {
  test('DOCUMENT_VERIFIED appears in trust ledger', async () => {
    const { eventStore, ledgerStore, hooks } = makeStack();
    const svc = createDocumentService({ store: new InMemoryDocumentStore(), hooks });

    await svc.createDocument({
      document_id: 'doc-1', tenant_id: TENANT, worker_id: WORKER,
      onboarding_case_id: CASE_ID, document_type: 'IQAMA', created_at: '2026-03-07T02:00:00Z',
    });

    await svc.verifyDocument({
      document_id: 'doc-1', verified_by: 'u-compliance', verified_at: '2026-03-07T02:10:00Z',
      event_id: 'ev-verify-1', occurred_at: '2026-03-07T02:10:00Z',
      actor: ACTOR, correlation_id: 'corr-1', causation_id: 'caus-1', metadata: {},
    });

    const events  = await eventStore.all();
    const verifyEvt = events.find(e => e.event_type === 'DOCUMENT_VERIFIED');
    assert.ok(verifyEvt, 'DOCUMENT_VERIFIED must be in event store');

    const entries = await ledgerStore.all();
    const entry   = entries.find(e => e.event_id === verifyEvt.event_id);
    assert.ok(entry, 'DOCUMENT_VERIFIED must be in trust ledger');
    assert.ok(entry.entry_hash);
    assert.ok(entry.payload_digest);
  });
});

describe('Trust Integration — WPS_READINESS_GENERATED flows to ledger', () => {
  test('WPS_READINESS_GENERATED appears in trust ledger', async () => {
    const { eventStore, ledgerStore, hooks } = makeStack();
    const svc = createComplianceService({ store: new InMemoryComplianceStore(), hooks });

    await svc.generateWpsReadiness({
      artifact_id: 'art-1', worker_id: WORKER, onboarding_case_id: CASE_ID, tenant_id: TENANT,
      salary_lines: [{ component: 'BASE', amount: 12000 }],
      approver_ids: ['u-approver'],
      generated_at: '2026-03-07T02:00:00Z',
      event_id: 'ev-wps-1', occurred_at: '2026-03-07T02:00:00Z',
      actor: ACTOR, correlation_id: 'corr-2', causation_id: 'caus-2',
    });

    const events = await eventStore.all();
    const wpsEvt = events.find(e => e.event_type === 'WPS_READINESS_GENERATED');
    assert.ok(wpsEvt);

    const entries = await ledgerStore.all();
    assert.ok(entries.find(e => e.event_id === wpsEvt.event_id));
  });
});

describe('Trust Integration — CONTRACT_SIGNED flows to ledger', () => {
  test('CONTRACT_SIGNED appears in trust ledger', async () => {
    const { eventStore, ledgerStore, hooks } = makeStack();
    const svc = createContractService({ store: new InMemoryContractStore(), hooks });

    await svc.draftContract({
      contract_id: 'ctr-1', tenant_id: TENANT, worker_id: WORKER,
      onboarding_case_id: CASE_ID, role_title: 'Engineer', wage_base: 10000,
      created_at: '2026-03-07T02:00:00Z',
      event_id: 'ev-draft', occurred_at: '2026-03-07T02:00:00Z',
      actor: ACTOR, correlation_id: 'corr-d', causation_id: 'caus-d',
    });

    await svc.transitionContract({
      contract_id: 'ctr-1', next_status: 'SIGNED', updated_at: '2026-03-07T02:10:00Z',
      event_id: 'ev-signed', occurred_at: '2026-03-07T02:10:00Z',
      actor: ACTOR, correlation_id: 'corr-s', causation_id: 'caus-s',
    });

    const events   = await eventStore.all();
    const signedEvt = events.find(e => e.event_type === 'CONTRACT_SIGNED');
    assert.ok(signedEvt);

    const entries = await ledgerStore.all();
    assert.ok(entries.find(e => e.event_id === signedEvt.event_id));
  });
});

describe('Trust Integration — PROBATION_DECISION_RECORDED flows to ledger', () => {
  test('PROBATION_DECISION_RECORDED appears in trust ledger', async () => {
    const { eventStore, ledgerStore, hooks } = makeStack();
    const svc = createProbationService({ store: new InMemoryProbationStore(), hooks });

    await svc.openProbationCase({
      probation_case_id: 'prob-1', tenant_id: TENANT, worker_id: WORKER,
      onboarding_case_id: CASE_ID, started_at: '2026-03-07T00:00:00Z',
    });

    await svc.recordDecision({
      probation_case_id: 'prob-1', decision: 'CONFIRM', reason_code: 'PASS',
      decision_at: '2026-06-04T00:00:00Z', tenant_id: TENANT,
      event_id: 'ev-dec-1', occurred_at: '2026-06-04T00:00:00Z',
      actor: ACTOR, correlation_id: 'corr-p', causation_id: 'caus-p',
    });

    const events  = await eventStore.all();
    const decEvt  = events.find(e => e.event_type === 'PROBATION_DECISION_RECORDED');
    assert.ok(decEvt);

    const entries = await ledgerStore.all();
    assert.ok(entries.find(e => e.event_id === decEvt.event_id));
  });
});

describe('Trust Integration — IBAN_CAPTURED does NOT go to ledger', () => {
  test('IBAN_CAPTURED is not ledgered (non-sensitive)', async () => {
    const { eventStore, ledgerStore, hooks } = makeStack();
    const svc = createComplianceService({ store: new InMemoryComplianceStore(), hooks });

    await svc.captureIban({
      worker_id: WORKER, onboarding_case_id: CASE_ID, tenant_id: TENANT,
      iban: 'SA0380000000608010167519', updated_at: '2026-03-07T02:00:00Z',
      event_id: 'ev-iban', occurred_at: '2026-03-07T02:00:00Z',
      actor: ACTOR, correlation_id: 'corr-i', causation_id: 'caus-i',
    });

    const events = await eventStore.all();
    const ibanEvt = events.find(e => e.event_type === 'IBAN_CAPTURED');
    assert.ok(ibanEvt, 'IBAN_CAPTURED must be in event store');

    const entries = await ledgerStore.all();
    assert.equal(entries.find(e => e.event_id === ibanEvt.event_id), undefined,
      'IBAN_CAPTURED must NOT be in trust ledger');
  });
});

describe('Trust Integration — ledger chain integrity', () => {
  test('multiple trust-sensitive onboarding events form a valid chain', async () => {
    const { eventStore, ledgerStore, hooks } = makeStack();
    const docSvc  = createDocumentService(  { store: new InMemoryDocumentStore(),   hooks });
    const cmpSvc  = createComplianceService({ store: new InMemoryComplianceStore(), hooks });
    const probSvc = createProbationService( { store: new InMemoryProbationStore(),  hooks });

    // 1. Upload doc (non-sensitive) + verify (sensitive → ledger entry 1)
    await docSvc.createDocument({
      document_id: 'doc-c', tenant_id: TENANT, worker_id: WORKER,
      onboarding_case_id: CASE_ID, document_type: 'NATIONAL_ID', created_at: '2026-03-07T02:00:00Z',
    });
    await docSvc.verifyDocument({
      document_id: 'doc-c', verified_by: 'u-c', verified_at: '2026-03-07T02:05:00Z',
      event_id: 'ev-c-1', occurred_at: '2026-03-07T02:05:00Z',
      actor: ACTOR, correlation_id: 'cc1', causation_id: 'cc1', metadata: {},
    });

    // 2. WPS readiness (sensitive → ledger entry 2)
    await cmpSvc.generateWpsReadiness({
      artifact_id: 'art-c', worker_id: WORKER, onboarding_case_id: CASE_ID, tenant_id: TENANT,
      salary_lines: [{ amount: 10000 }], approver_ids: ['u-c'],
      generated_at: '2026-03-07T02:10:00Z',
      event_id: 'ev-c-2', occurred_at: '2026-03-07T02:10:00Z',
      actor: ACTOR, correlation_id: 'cc2', causation_id: 'cc2',
    });

    // 3. Probation decision (sensitive → ledger entry 3)
    await probSvc.openProbationCase({
      probation_case_id: 'prob-c', tenant_id: TENANT, worker_id: WORKER,
      onboarding_case_id: CASE_ID, started_at: '2026-03-07T00:00:00Z',
    });
    await probSvc.recordDecision({
      probation_case_id: 'prob-c', decision: 'CONFIRM', reason_code: 'PASS',
      decision_at: '2026-06-04T00:00:00Z', tenant_id: TENANT,
      event_id: 'ev-c-3', occurred_at: '2026-06-04T00:00:00Z',
      actor: ACTOR, correlation_id: 'cc3', causation_id: 'cc3',
    });

    const entries = await ledgerStore.all();
    assert.equal(entries.length, 3, 'expected 3 trust-sensitive ledger entries');

    for (let i = 1; i < entries.length; i++) {
      assert.equal(entries[i].prev_hash, entries[i - 1].entry_hash, `chain broken at index ${i}`);
    }
  });
});
