'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { createEventPublisher, InMemoryEventStore } = require('../app/modules/event_bus/index');
const { createTrustConsumer, InMemoryLedgerStore }  = require('../app/modules/trust_engine/trust_consumer');
const { createHiringCaseService, InMemoryHiringCaseStore } = require('../app/modules/hiring/hiring_case_service');
const { createApprovalService,   InMemoryApprovalStore   } = require('../app/modules/hiring/approval_service');
const { createOfferService,      InMemoryOfferStore      } = require('../app/modules/hiring/offer_service');
const { createAcceptanceService                          } = require('../app/modules/hiring/acceptance_service');
const { createQiwaMappingService                         } = require('../app/modules/hiring/qiwa_mapping_service');

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

const TENANT = '22222222-2222-2222-2222-222222222222';
const ACTOR  = { actor_type: 'HUMAN', actor_id: '55555555-5555-5555-5555-555555555555' };

describe('Trust Integration — HIRING_CASE_OPENED is NOT ledgered (STANDARD)', () => {
  test('HIRING_CASE_OPENED does not appear in trust ledger', async () => {
    const { eventStore, ledgerStore, hooks } = makeStack();
    const svc = createHiringCaseService({ store: new InMemoryHiringCaseStore(), hooks });

    const rec = await svc.openHiringCase({
      tenant_id: TENANT, candidate_id: 'c1', requisition_id: 'r1',
      actor: ACTOR, correlation_id: 'corr-1', causation_id: 'caus-1',
    });

    const events = await eventStore.all();
    const openEvt = events.find(e => e.event_type === 'HIRING_CASE_OPENED');
    assert.ok(openEvt, 'HIRING_CASE_OPENED must be in event store');

    const entries = await ledgerStore.all();
    assert.equal(
      entries.find(e => e.event_id === openEvt.event_id),
      undefined,
      'HIRING_CASE_OPENED must NOT be in trust ledger',
    );
  });
});

describe('Trust Integration — HIRING_DECISION_RECORDED flows to ledger', () => {
  test('HIRING_DECISION_RECORDED appears in trust ledger', async () => {
    const { eventStore, ledgerStore, hooks } = makeStack();
    const svc = createHiringCaseService({ store: new InMemoryHiringCaseStore(), hooks });

    const rec = await svc.openHiringCase({
      tenant_id: TENANT, candidate_id: 'c1', requisition_id: 'r1',
      actor: ACTOR, correlation_id: 'corr-2a', causation_id: 'caus-2a',
    });
    await svc.recordDecision({
      case_id: rec.id, decision: 'HIRED',
      actor: ACTOR, correlation_id: 'corr-2b', causation_id: 'caus-2b',
    });

    const events = await eventStore.all();
    const decEvt = events.find(e => e.event_type === 'HIRING_DECISION_RECORDED');
    assert.ok(decEvt);

    const entries = await ledgerStore.all();
    const entry = entries.find(e => e.event_id === decEvt.event_id);
    assert.ok(entry, 'HIRING_DECISION_RECORDED must be in trust ledger');
    assert.ok(entry.entry_hash);
    assert.ok(entry.payload_digest);
  });
});

describe('Trust Integration — OFFER_APPROVED flows to ledger', () => {
  test('OFFER_APPROVED appears in trust ledger', async () => {
    const { eventStore, ledgerStore, hooks } = makeStack();
    const svc = createApprovalService({ store: new InMemoryApprovalStore(), hooks });

    await svc.approveOffer({
      hiring_case_id: 'case-ti-1', actor_id: 'u-cfo', tenant_id: TENANT,
      actor: ACTOR, correlation_id: 'corr-3', causation_id: 'caus-3',
    });

    const events = await eventStore.all();
    const approvedEvt = events.find(e => e.event_type === 'OFFER_APPROVED');
    assert.ok(approvedEvt);

    const entries = await ledgerStore.all();
    assert.ok(entries.find(e => e.event_id === approvedEvt.event_id));
  });
});

describe('Trust Integration — OFFER_ACCEPTANCE flows to ledger', () => {
  test('OFFER_ACCEPTED appears in trust ledger', async () => {
    const { eventStore, ledgerStore, hooks } = makeStack();
    const svc = createAcceptanceService({ hooks });

    await svc.acceptOffer({
      offer_id: 'offer-ti-1', tenant_id: TENANT,
      actor: ACTOR, correlation_id: 'corr-4', causation_id: 'caus-4',
    });

    const events = await eventStore.all();
    const accEvt = events.find(e => e.event_type === 'OFFER_ACCEPTED');
    assert.ok(accEvt);

    const entries = await ledgerStore.all();
    assert.ok(entries.find(e => e.event_id === accEvt.event_id));
  });

  test('OFFER_DECLINED is NOT ledgered (STANDARD)', async () => {
    const { eventStore, ledgerStore, hooks } = makeStack();
    const svc = createAcceptanceService({ hooks });

    await svc.declineOffer({
      offer_id: 'offer-ti-2', tenant_id: TENANT,
      actor: ACTOR, correlation_id: 'corr-5', causation_id: 'caus-5',
    });

    const events = await eventStore.all();
    const decEvt = events.find(e => e.event_type === 'OFFER_DECLINED');
    assert.ok(decEvt, 'OFFER_DECLINED must be in event store');

    const entries = await ledgerStore.all();
    assert.equal(
      entries.find(e => e.event_id === decEvt.event_id),
      undefined,
      'OFFER_DECLINED must NOT be in trust ledger',
    );
  });
});

describe('Trust Integration — CONTRACT_MIRROR_MAPPED flows to ledger', () => {
  test('CONTRACT_MIRROR_MAPPED appears in trust ledger', async () => {
    const { eventStore, ledgerStore, hooks } = makeStack();
    const svc = createQiwaMappingService({ hooks });

    await svc.mapContract({
      case_id: 'case-ti-2', tenant_id: TENANT, role_title: 'Engineer',
      actor: ACTOR, correlation_id: 'corr-6', causation_id: 'caus-6',
    });

    const events = await eventStore.all();
    const mapEvt = events.find(e => e.event_type === 'CONTRACT_MIRROR_MAPPED');
    assert.ok(mapEvt);

    const entries = await ledgerStore.all();
    assert.ok(entries.find(e => e.event_id === mapEvt.event_id));
  });
});

describe('Trust Integration — hiring trust chain integrity', () => {
  test('OFFER_APPROVED → OFFER_ACCEPTED → HIRING_DECISION_RECORDED form a valid chain', async () => {
    const { eventStore, ledgerStore, hooks } = makeStack();
    const caseSvc     = createHiringCaseService({ store: new InMemoryHiringCaseStore(), hooks });
    const approvalSvc = createApprovalService(  { store: new InMemoryApprovalStore(),   hooks });
    const acceptSvc   = createAcceptanceService({ hooks });

    // 1. Open case (STANDARD — not ledgered)
    const rec = await caseSvc.openHiringCase({
      tenant_id: TENANT, candidate_id: 'c1', requisition_id: 'r1',
      actor: ACTOR, correlation_id: 'ch1', causation_id: 'ch1',
    });

    // 2. Approve offer (HIGH — ledger entry 1)
    await approvalSvc.approveOffer({
      hiring_case_id: rec.id, actor_id: 'u-cfo', tenant_id: TENANT,
      actor: ACTOR, correlation_id: 'ch2', causation_id: 'ch2',
    });

    // 3. Accept offer (HIGH — ledger entry 2)
    await acceptSvc.acceptOffer({
      offer_id: 'offer-chain-1', tenant_id: TENANT,
      actor: ACTOR, correlation_id: 'ch3', causation_id: 'ch3',
    });

    // 4. Record decision (HIGH — ledger entry 3)
    await caseSvc.recordDecision({
      case_id: rec.id, decision: 'HIRED',
      actor: ACTOR, correlation_id: 'ch4', causation_id: 'ch4',
    });

    const entries = await ledgerStore.all();
    assert.equal(entries.length, 3, 'expected 3 trust-sensitive ledger entries');

    for (let i = 1; i < entries.length; i++) {
      assert.equal(entries[i].prev_hash, entries[i - 1].entry_hash, `chain broken at index ${i}`);
    }
  });
});
