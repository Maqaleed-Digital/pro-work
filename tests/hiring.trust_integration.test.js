'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { createEventPublisher, InMemoryEventStore } = require('../app/modules/event_bus/index');
const { createTrustConsumer, InMemoryLedgerStore }  = require('../app/modules/trust_engine/trust_consumer');
const { createCompensationService, InMemoryCompensationStore } = require('../app/modules/hiring/compensation_service');
const { createOfferService,        InMemoryOfferStore        } = require('../app/modules/hiring/offer_service');
const { createApprovalService,     InMemoryApprovalStore     } = require('../app/modules/hiring/approval_service');
const { createAcceptanceService,   InMemoryAcceptanceStore   } = require('../app/modules/hiring/acceptance_service');
const { createDecisionService,     InMemoryDecisionStore     } = require('../app/modules/hiring/decision_service');

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

describe('Trust Integration — COMPENSATION_PACKAGE_DRAFTED is NOT ledgered (STANDARD)', () => {
  test('COMPENSATION_PACKAGE_DRAFTED does not appear in trust ledger', async () => {
    const { eventStore, ledgerStore, hooks } = makeStack();
    const svc = createCompensationService({ store: new InMemoryCompensationStore(), hooks });

    await svc.draftPackage({
      package_id:     'pkg-ti-1', tenant_id: TENANT,
      requisition_id: 'req-ti-1', candidate_id: 'cand-ti-1',
      base_salary:    15000, currency: 'SAR', allowances: [],
      created_at:     '2026-03-07T07:00:00Z',
      event_id:       'ev-ti-draft', occurred_at: '2026-03-07T07:00:00Z',
      actor: ACTOR, correlation_id: 'corr-ti-1', causation_id: 'caus-ti-1',
    });

    const events = await eventStore.all();
    const draftEvt = events.find(e => e.event_type === 'COMPENSATION_PACKAGE_DRAFTED');
    assert.ok(draftEvt, 'COMPENSATION_PACKAGE_DRAFTED must be in event store');

    const entries = await ledgerStore.all();
    assert.equal(
      entries.find(e => e.event_id === draftEvt.event_id),
      undefined,
      'COMPENSATION_PACKAGE_DRAFTED must NOT be in trust ledger',
    );
  });
});

describe('Trust Integration — COMPENSATION_PACKAGE_APPROVED flows to ledger', () => {
  test('COMPENSATION_PACKAGE_APPROVED appears in trust ledger', async () => {
    const { eventStore, ledgerStore, hooks } = makeStack();
    const svc = createCompensationService({ store: new InMemoryCompensationStore(), hooks });

    await svc.draftPackage({
      package_id:     'pkg-ti-2', tenant_id: TENANT,
      requisition_id: 'req-ti-2', candidate_id: 'cand-ti-2',
      base_salary:    20000, currency: 'SAR', allowances: [],
      created_at:     '2026-03-07T07:00:00Z',
      event_id:       'ev-ti-d2', occurred_at: '2026-03-07T07:00:00Z',
      actor: ACTOR, correlation_id: 'corr-ti-2a', causation_id: 'caus-ti-2a',
    });

    await svc.approvePackage({
      package_id:  'pkg-ti-2', approved_by: 'u-cfo', approved_at: '2026-03-07T08:00:00Z',
      event_id:    'ev-ti-approve', occurred_at: '2026-03-07T08:00:00Z',
      actor: ACTOR, correlation_id: 'corr-ti-2b', causation_id: 'caus-ti-2b',
    });

    const events = await eventStore.all();
    const approvedEvt = events.find(e => e.event_type === 'COMPENSATION_PACKAGE_APPROVED');
    assert.ok(approvedEvt);

    const entries = await ledgerStore.all();
    const entry = entries.find(e => e.event_id === approvedEvt.event_id);
    assert.ok(entry, 'COMPENSATION_PACKAGE_APPROVED must be in trust ledger');
    assert.ok(entry.entry_hash);
    assert.ok(entry.payload_digest);
  });
});

describe('Trust Integration — HIRING_OFFER_SENT flows to ledger', () => {
  test('HIRING_OFFER_SENT appears in trust ledger', async () => {
    const { eventStore, ledgerStore, hooks } = makeStack();
    const svc = createOfferService({ store: new InMemoryOfferStore(), hooks });

    await svc.createOffer({
      offer_id: 'offer-ti-1', tenant_id: TENANT,
      requisition_id: 'req-ti', candidate_id: 'cand-ti', package_id: 'pkg-ti',
      created_at: '2026-03-07T07:00:00Z',
      event_id: 'ev-ti-create', occurred_at: '2026-03-07T07:00:00Z',
      actor: ACTOR, correlation_id: 'corr-oc', causation_id: 'caus-oc',
    });

    await svc.sendOffer({
      offer_id: 'offer-ti-1', sent_by: 'u-hr',
      sent_at: '2026-03-07T08:00:00Z', expiry_date: '2026-03-14T08:00:00Z',
      event_id: 'ev-ti-send', occurred_at: '2026-03-07T08:00:00Z',
      actor: ACTOR, correlation_id: 'corr-os', causation_id: 'caus-os',
    });

    const events = await eventStore.all();
    const sentEvt = events.find(e => e.event_type === 'HIRING_OFFER_SENT');
    assert.ok(sentEvt);

    const entries = await ledgerStore.all();
    assert.ok(entries.find(e => e.event_id === sentEvt.event_id));
  });
});

describe('Trust Integration — HIRING_DECISION_RECORDED flows to ledger', () => {
  test('HIRING_DECISION_RECORDED appears in trust ledger', async () => {
    const { eventStore, ledgerStore, hooks } = makeStack();
    const svc = createDecisionService({ store: new InMemoryDecisionStore(), hooks });

    await svc.recordDecision({
      decision_id:    'dec-ti-1', tenant_id: TENANT,
      requisition_id: 'req-ti', candidate_id: 'cand-ti',
      decision:       'HIRED', decided_by: 'u-cto', decided_at: '2026-03-07T11:00:00Z',
      created_at:     '2026-03-07T11:00:00Z',
      event_id:       'ev-ti-dec', occurred_at: '2026-03-07T11:00:00Z',
      actor: ACTOR, correlation_id: 'corr-td', causation_id: 'caus-td',
    });

    const events = await eventStore.all();
    const decEvt = events.find(e => e.event_type === 'HIRING_DECISION_RECORDED');
    assert.ok(decEvt);

    const entries = await ledgerStore.all();
    const entry = entries.find(e => e.event_id === decEvt.event_id);
    assert.ok(entry, 'HIRING_DECISION_RECORDED must be in trust ledger');
  });
});

describe('Trust Integration — CANDIDATE_ACCEPTANCE_RECORDED flows to ledger', () => {
  test('CANDIDATE_ACCEPTANCE_RECORDED appears in trust ledger', async () => {
    const { eventStore, ledgerStore, hooks } = makeStack();
    const svc = createAcceptanceService({ store: new InMemoryAcceptanceStore(), hooks });

    await svc.recordAcceptance({
      acceptance_id: 'acc-ti-1', tenant_id: TENANT,
      offer_id: 'offer-ti', candidate_id: 'cand-ti',
      response: 'ACCEPTED', responded_at: '2026-03-07T10:00:00Z',
      created_at: '2026-03-07T10:00:00Z',
      event_id: 'ev-ti-acc', occurred_at: '2026-03-07T10:00:00Z',
      actor: ACTOR, correlation_id: 'corr-ta', causation_id: 'caus-ta',
    });

    const events = await eventStore.all();
    const accEvt = events.find(e => e.event_type === 'CANDIDATE_ACCEPTANCE_RECORDED');
    assert.ok(accEvt);

    const entries = await ledgerStore.all();
    assert.ok(entries.find(e => e.event_id === accEvt.event_id));
  });
});

describe('Trust Integration — HIRING_APPROVAL_REQUESTED is NOT ledgered (STANDARD)', () => {
  test('HIRING_APPROVAL_REQUESTED does not appear in trust ledger', async () => {
    const { eventStore, ledgerStore, hooks } = makeStack();
    const svc = createApprovalService({ store: new InMemoryApprovalStore(), hooks });

    await svc.requestApproval({
      approval_id: 'appr-ti-1', tenant_id: TENANT,
      offer_id: 'offer-ti', requisition_id: 'req-ti',
      requested_by: 'u-mgr', approver_id: 'u-cfo',
      requested_at: '2026-03-07T08:00:00Z', created_at: '2026-03-07T08:00:00Z',
      event_id: 'ev-ti-req', occurred_at: '2026-03-07T08:00:00Z',
      actor: ACTOR, correlation_id: 'corr-req', causation_id: 'caus-req',
    });

    const events = await eventStore.all();
    const reqEvt = events.find(e => e.event_type === 'HIRING_APPROVAL_REQUESTED');
    assert.ok(reqEvt, 'HIRING_APPROVAL_REQUESTED must be in event store');

    const entries = await ledgerStore.all();
    assert.equal(
      entries.find(e => e.event_id === reqEvt.event_id),
      undefined,
      'HIRING_APPROVAL_REQUESTED must NOT be in trust ledger',
    );
  });
});

describe('Trust Integration — hiring trust events form a valid chain', () => {
  test('COMPENSATION_PACKAGE_APPROVED → HIRING_OFFER_SENT → HIRING_DECISION_RECORDED chain', async () => {
    const { eventStore, ledgerStore, hooks } = makeStack();
    const compSvc = createCompensationService({ store: new InMemoryCompensationStore(), hooks });
    const offerSvc = createOfferService({ store: new InMemoryOfferStore(), hooks });
    const decSvc  = createDecisionService({ store: new InMemoryDecisionStore(), hooks });

    // 1. Approve compensation package (trust-sensitive → ledger entry 1)
    await compSvc.draftPackage({
      package_id: 'pkg-chain-1', tenant_id: TENANT,
      requisition_id: 'req-chain', candidate_id: 'cand-chain',
      base_salary: 18000, currency: 'SAR', allowances: [],
      created_at: '2026-03-07T07:00:00Z',
      event_id: 'ev-chain-d', occurred_at: '2026-03-07T07:00:00Z',
      actor: ACTOR, correlation_id: 'ch1', causation_id: 'ch1',
    });
    await compSvc.approvePackage({
      package_id: 'pkg-chain-1', approved_by: 'u-cfo', approved_at: '2026-03-07T08:00:00Z',
      event_id: 'ev-chain-a', occurred_at: '2026-03-07T08:00:00Z',
      actor: ACTOR, correlation_id: 'ch2', causation_id: 'ch2',
    });

    // 2. Send offer (trust-sensitive → ledger entry 2)
    await offerSvc.createOffer({
      offer_id: 'offer-chain-1', tenant_id: TENANT,
      requisition_id: 'req-chain', candidate_id: 'cand-chain', package_id: 'pkg-chain-1',
      created_at: '2026-03-07T08:30:00Z',
      event_id: 'ev-chain-oc', occurred_at: '2026-03-07T08:30:00Z',
      actor: ACTOR, correlation_id: 'ch3', causation_id: 'ch3',
    });
    await offerSvc.sendOffer({
      offer_id: 'offer-chain-1', sent_by: 'u-hr',
      sent_at: '2026-03-07T09:00:00Z', expiry_date: '2026-03-21T09:00:00Z',
      event_id: 'ev-chain-os', occurred_at: '2026-03-07T09:00:00Z',
      actor: ACTOR, correlation_id: 'ch4', causation_id: 'ch4',
    });

    // 3. Record hiring decision (trust-sensitive → ledger entry 3)
    await decSvc.recordDecision({
      decision_id: 'dec-chain-1', tenant_id: TENANT,
      requisition_id: 'req-chain', candidate_id: 'cand-chain',
      decision: 'HIRED', decided_by: 'u-cto', decided_at: '2026-03-07T12:00:00Z',
      created_at: '2026-03-07T12:00:00Z',
      event_id: 'ev-chain-dec', occurred_at: '2026-03-07T12:00:00Z',
      actor: ACTOR, correlation_id: 'ch5', causation_id: 'ch5',
    });

    const entries = await ledgerStore.all();
    assert.equal(entries.length, 3, 'expected 3 trust-sensitive ledger entries');

    for (let i = 1; i < entries.length; i++) {
      assert.equal(entries[i].prev_hash, entries[i - 1].entry_hash, `chain broken at index ${i}`);
    }
  });
});
