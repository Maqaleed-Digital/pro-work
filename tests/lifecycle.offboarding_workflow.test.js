'use strict';

/**
 * S38-G5 — Offboarding Workflow Service Tests
 *
 * Covers: initiation, checklist completion, finalization gate (mandatory items),
 * HR approver gate (human-only), terminal state enforcement, EP_WOS_OFFBOARD_01
 * auto-generation, ESB calculation inclusion, policy-based checklist, canFinalize.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');

const {
  createOffboardingWorkflowService,
  InMemoryOffboardingWorkflowStore,
} = require('../app/modules/lifecycle/offboarding_workflow_service');

const { createEvidencePackService, InMemoryEvidencePackStore } = require('../app/modules/evidence/evidence_pack_service');
const { createEsbCalculatorService } = require('../app/modules/compliance/esb_calculator_service');

// ── helpers ───────────────────────────────────────────────────────────────────

const noopHooks = { publish: async () => {} };

function makeStore() { return new InMemoryOffboardingWorkflowStore(); }

function makeSvc(overrides = {}) {
  return createOffboardingWorkflowService({
    store: makeStore(),
    hooks: noopHooks,
    ...overrides,
  });
}

const MINIMAL_POLICY = {
  v1: {
    version: 'v1',
    defaultChecklist: [
      { item_id: 'notice-ack',   title: 'Notice Acknowledgement', title_ar: 'إقرار الإشعار',  category: 'HR',      mandatory: true,  requires_evidence: false },
      { item_id: 'asset-return', title: 'Asset Return',           title_ar: 'إعادة الأصول',   category: 'OPS',     mandatory: true,  requires_evidence: true  },
      { item_id: 'exit-interv',  title: 'Exit Interview',         title_ar: 'مقابلة الخروج',  category: 'HR',      mandatory: false, requires_evidence: false },
    ],
  },
};

function makeSvcWithPolicy(epSvc) {
  return createOffboardingWorkflowService({
    store: makeStore(), hooks: noopHooks, policies: MINIMAL_POLICY,
    evidencePackService: epSvc,
  });
}

function baseInitInput(overrides = {}) {
  return {
    offboarding_case_id: 'ob-001',
    worker_id:           'wrk-001',
    tenant_id:           'tenant-test',
    termination_reason:  'RESIGNATION',
    notice_date:         '2026-04-01',
    last_working_date:   '2026-05-01',
    ...overrides,
  };
}

const HR_APPROVER = { approver_id: 'hr-mgr-1', approver_name: 'Ahmed Al-Rashid', approver_role: 'HR' };

// ── 1. initiateOffboarding ────────────────────────────────────────────────────

describe('initiateOffboarding', () => {
  test('creates case with status INITIATED', async () => {
    const svc = makeSvcWithPolicy();
    const c = await svc.initiateOffboarding(baseInitInput());
    assert.equal(c.status, 'INITIATED');
    assert.equal(c.offboarding_case_id, 'ob-001');
    assert.equal(c.worker_id, 'wrk-001');
  });

  test('builds default checklist from policy — correct count', async () => {
    const svc = makeSvcWithPolicy();
    await svc.initiateOffboarding(baseInitInput());
    const checklist = await svc.getChecklist('ob-001');
    assert.equal(checklist.length, 3);
    assert.ok(checklist.every(i => i.status === 'PENDING'));
  });

  test('tenant-supplied custom_checklist overrides policy default', async () => {
    const svc = makeSvcWithPolicy();
    await svc.initiateOffboarding(baseInitInput({
      custom_checklist: [
        { item_id: 'custom-1', title: 'Custom Item', title_ar: 'مهمة مخصصة', category: 'OPS', mandatory: true, requires_evidence: false },
      ],
    }));
    const checklist = await svc.getChecklist('ob-001');
    assert.equal(checklist.length, 1);
    assert.equal(checklist[0].item_id, 'custom-1');
  });

  test('rejects unknown termination_reason', async () => {
    const svc = makeSvcWithPolicy();
    await assert.rejects(
      () => svc.initiateOffboarding(baseInitInput({ termination_reason: 'FIRED_INSTANTLY' })),
      (err) => err.code === 'INVALID_TERMINATION_REASON',
    );
  });

  test('rejects missing worker_id', async () => {
    const svc = makeSvcWithPolicy();
    await assert.rejects(
      () => svc.initiateOffboarding(baseInitInput({ worker_id: null })),
      { name: 'OffboardingWorkflowError' },
    );
  });
});

// ── 2. completeChecklistItem ──────────────────────────────────────────────────

describe('completeChecklistItem', () => {
  test('marks item COMPLETED with completedBy', async () => {
    const svc = makeSvcWithPolicy();
    await svc.initiateOffboarding(baseInitInput());
    const item = await svc.completeChecklistItem('ob-001', 'notice-ack', 'HR Manager');
    assert.equal(item.status, 'COMPLETED');
    assert.equal(item.completed_by, 'HR Manager');
    assert.ok(item.completed_at);
  });

  test('stores evidence note on completion', async () => {
    const svc = makeSvcWithPolicy();
    await svc.initiateOffboarding(baseInitInput());
    const item = await svc.completeChecklistItem('ob-001', 'asset-return', 'IT Admin', 'Laptop serial: ABC123');
    assert.equal(item.evidence_note, 'Laptop serial: ABC123');
  });

  test('throws on unknown item_id', async () => {
    const svc = makeSvcWithPolicy();
    await svc.initiateOffboarding(baseInitInput());
    await assert.rejects(
      () => svc.completeChecklistItem('ob-001', 'no-such-item', 'HR'),
      (err) => err.code === 'ITEM_NOT_FOUND',
    );
  });

  test('throws when case is already FINALIZED', async () => {
    const svc = makeSvcWithPolicy();
    await svc.initiateOffboarding(baseInitInput());
    await svc.completeChecklistItem('ob-001', 'notice-ack', 'HR');
    await svc.completeChecklistItem('ob-001', 'asset-return', 'IT');
    await svc.finalizeOffboarding('ob-001', HR_APPROVER);

    await assert.rejects(
      () => svc.completeChecklistItem('ob-001', 'exit-interv', 'HR'),
      (err) => err.code === 'CASE_FINALIZED',
    );
  });
});

// ── 3. canFinalize ────────────────────────────────────────────────────────────

describe('canFinalize', () => {
  test('returns ok:false when mandatory items incomplete', async () => {
    const svc = makeSvcWithPolicy();
    await svc.initiateOffboarding(baseInitInput());
    const result = await svc.canFinalize('ob-001');
    assert.equal(result.ok, false);
    assert.ok(result.blockers.length >= 2);  // 2 mandatory items pending
  });

  test('returns ok:true when all mandatory items completed', async () => {
    const svc = makeSvcWithPolicy();
    await svc.initiateOffboarding(baseInitInput());
    await svc.completeChecklistItem('ob-001', 'notice-ack',   'HR');
    await svc.completeChecklistItem('ob-001', 'asset-return', 'IT');
    const result = await svc.canFinalize('ob-001');
    assert.equal(result.ok, true);
    assert.equal(result.blockers.length, 0);
  });

  test('optional items do not block finalization', async () => {
    const svc = makeSvcWithPolicy();
    await svc.initiateOffboarding(baseInitInput());
    await svc.completeChecklistItem('ob-001', 'notice-ack',   'HR');
    await svc.completeChecklistItem('ob-001', 'asset-return', 'IT');
    // exit-interv is optional and left PENDING — should not block
    const result = await svc.canFinalize('ob-001');
    assert.equal(result.ok, true);
  });
});

// ── 4. finalizeOffboarding — mandatory item gate ──────────────────────────────

describe('finalizeOffboarding — mandatory item gate', () => {
  test('blocks finalization when mandatory items incomplete — MANDATORY_ITEMS_INCOMPLETE', async () => {
    const svc = makeSvcWithPolicy();
    await svc.initiateOffboarding(baseInitInput());
    // Complete only one of two mandatory items
    await svc.completeChecklistItem('ob-001', 'notice-ack', 'HR');

    await assert.rejects(
      () => svc.finalizeOffboarding('ob-001', HR_APPROVER),
      (err) => err.code === 'MANDATORY_ITEMS_INCOMPLETE',
    );
  });

  test('blocks finalization with no HR approver — HR_APPROVER_REQUIRED', async () => {
    const svc = makeSvcWithPolicy();
    await svc.initiateOffboarding(baseInitInput());
    await svc.completeChecklistItem('ob-001', 'notice-ack',   'HR');
    await svc.completeChecklistItem('ob-001', 'asset-return', 'IT');

    await assert.rejects(
      () => svc.finalizeOffboarding('ob-001', null),
      (err) => err.code === 'HR_APPROVER_REQUIRED',
    );
  });

  test('blocks finalization with empty approver_id — HR_APPROVER_REQUIRED', async () => {
    const svc = makeSvcWithPolicy();
    await svc.initiateOffboarding(baseInitInput());
    await svc.completeChecklistItem('ob-001', 'notice-ack',   'HR');
    await svc.completeChecklistItem('ob-001', 'asset-return', 'IT');

    await assert.rejects(
      () => svc.finalizeOffboarding('ob-001', { approver_id: '' }),
      (err) => err.code === 'HR_APPROVER_REQUIRED',
    );
  });

  test('succeeds when all mandatory items COMPLETED + valid HR approver', async () => {
    const svc = makeSvcWithPolicy();
    await svc.initiateOffboarding(baseInitInput());
    await svc.completeChecklistItem('ob-001', 'notice-ack',   'HR');
    await svc.completeChecklistItem('ob-001', 'asset-return', 'IT');
    const finalized = await svc.finalizeOffboarding('ob-001', HR_APPROVER);
    assert.equal(finalized.status, 'FINALIZED');
    assert.ok(finalized.finalized_at);
    assert.equal(finalized.hr_approver.approver_id, HR_APPROVER.approver_id);
  });
});

// ── 5. terminal state ─────────────────────────────────────────────────────────

describe('terminal state — FINALIZED is irreversible', () => {
  test('re-finalization throws CASE_ALREADY_FINALIZED', async () => {
    const svc = makeSvcWithPolicy();
    await svc.initiateOffboarding(baseInitInput());
    await svc.completeChecklistItem('ob-001', 'notice-ack',   'HR');
    await svc.completeChecklistItem('ob-001', 'asset-return', 'IT');
    await svc.finalizeOffboarding('ob-001', HR_APPROVER);

    await assert.rejects(
      () => svc.finalizeOffboarding('ob-001', HR_APPROVER),
      (err) => err.code === 'CASE_ALREADY_FINALIZED',
    );
  });

  test('FINALIZED case status cannot change via completeChecklistItem', async () => {
    const svc = makeSvcWithPolicy();
    await svc.initiateOffboarding(baseInitInput());
    await svc.completeChecklistItem('ob-001', 'notice-ack',   'HR');
    await svc.completeChecklistItem('ob-001', 'asset-return', 'IT');
    await svc.finalizeOffboarding('ob-001', HR_APPROVER);

    await assert.rejects(
      () => svc.completeChecklistItem('ob-001', 'exit-interv', 'HR'),
      (err) => err.code === 'CASE_FINALIZED',
    );

    // Verify status unchanged
    const c = await svc.getCase('ob-001');
    assert.equal(c.status, 'FINALIZED');
  });
});

// ── 6. EP_WOS_OFFBOARD_01 auto-generation ────────────────────────────────────

describe('EP_WOS_OFFBOARD_01 auto-generation on finalization', () => {
  test('auto-generates EP on finalization when evidencePackService provided', async () => {
    const epStore = new InMemoryEvidencePackStore();
    const epSvc   = createEvidencePackService({ store: epStore });
    const svc = makeSvcWithPolicy(epSvc);

    await svc.initiateOffboarding(baseInitInput());
    await svc.completeChecklistItem('ob-001', 'notice-ack',   'HR');
    await svc.completeChecklistItem('ob-001', 'asset-return', 'IT');
    const finalized = await svc.finalizeOffboarding('ob-001', HR_APPROVER);

    assert.ok(finalized.evidence_pack_id, 'evidence_pack_id should be set');
    const ep = await epStore.get(finalized.evidence_pack_id);
    assert.ok(ep, 'EP should exist in store');
    assert.equal(ep.pack_type, 'EP_WOS_OFFBOARD_01');
    assert.equal(ep.status,    'OPEN');
    assert.match(ep.immutable_hash, /^[a-f0-9]{64}$/);
  });

  test('EP data_snapshot contains checklist summary', async () => {
    const epStore = new InMemoryEvidencePackStore();
    const epSvc   = createEvidencePackService({ store: epStore });
    const svc = makeSvcWithPolicy(epSvc);

    await svc.initiateOffboarding(baseInitInput());
    await svc.completeChecklistItem('ob-001', 'notice-ack',   'HR');
    await svc.completeChecklistItem('ob-001', 'asset-return', 'IT');
    const finalized = await svc.finalizeOffboarding('ob-001', HR_APPROVER);

    const ep = await epStore.get(finalized.evidence_pack_id);
    assert.ok(Array.isArray(ep.data_snapshot.checklist_summary));
    assert.ok(ep.data_snapshot.hr_approval.approver_id === HR_APPROVER.approver_id);
    assert.equal(ep.data_snapshot.worker_id, 'wrk-001');
  });

  test('EP data_snapshot includes ESB calculation when provided', async () => {
    const epStore = new InMemoryEvidencePackStore();
    const epSvc   = createEvidencePackService({ store: epStore });
    const svc = makeSvcWithPolicy(epSvc);

    const esbSvc  = createEsbCalculatorService();
    const esbResult = esbSvc.calculate({
      employmentStartDate: '2015-01-01',
      terminationDate:     '2025-01-01',
      basicSalary:         10000,
      housingAllowance:    3000,
      terminationReason:   'RESIGNATION',
    }, 'v1');

    await svc.initiateOffboarding(baseInitInput());
    await svc.completeChecklistItem('ob-001', 'notice-ack',   'HR');
    await svc.completeChecklistItem('ob-001', 'asset-return', 'IT');
    const finalized = await svc.finalizeOffboarding('ob-001', HR_APPROVER, esbResult);

    const ep = await epStore.get(finalized.evidence_pack_id);
    assert.ok(ep.data_snapshot.esb_calculation, 'ESB calculation should be in EP');
    assert.equal(ep.data_snapshot.esb_calculation.policy_version, 'v1');
    assert.ok(typeof ep.data_snapshot.esb_calculation.net_esb === 'number');
    assert.ok(ep.data_snapshot.esb_calculation.disclaimer.length > 10);
    // finalized case also records esb summary
    assert.equal(finalized.esb_calculation.policyVersion, 'v1');
  });

  test('no EP generated when evidencePackService absent (backward compatible)', async () => {
    const svc = makeSvcWithPolicy();  // no evidencePackService
    await svc.initiateOffboarding(baseInitInput());
    await svc.completeChecklistItem('ob-001', 'notice-ack',   'HR');
    await svc.completeChecklistItem('ob-001', 'asset-return', 'IT');
    const finalized = await svc.finalizeOffboarding('ob-001', HR_APPROVER);
    assert.equal(finalized.status, 'FINALIZED');
    assert.equal(finalized.evidence_pack_id, null);  // no EP service = no EP ID
  });
});

// ── 7. getChecklist ───────────────────────────────────────────────────────────

describe('getChecklist', () => {
  test('returns all items with correct mandatory flags', async () => {
    const svc = makeSvcWithPolicy();
    await svc.initiateOffboarding(baseInitInput());
    const cl = await svc.getChecklist('ob-001');
    const mandatoryIds = cl.filter(i => i.mandatory).map(i => i.item_id);
    assert.deepEqual(mandatoryIds.sort(), ['asset-return', 'notice-ack'].sort());
    const optionalIds = cl.filter(i => !i.mandatory).map(i => i.item_id);
    assert.deepEqual(optionalIds, ['exit-interv']);
  });

  test('throws CASE_NOT_FOUND for unknown caseId', async () => {
    const svc = makeSvcWithPolicy();
    await assert.rejects(
      () => svc.getChecklist('no-such-case'),
      (err) => err.code === 'CASE_NOT_FOUND',
    );
  });
});
