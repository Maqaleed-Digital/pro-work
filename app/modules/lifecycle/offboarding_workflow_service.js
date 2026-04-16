'use strict';

const path   = require('path');
const fs     = require('fs');
const crypto = require('crypto');

// ── load versioned checklist policies ────────────────────────────────────────

const POLICY_DIR = path.join(__dirname, '../../config/lifecycle');

function loadPolicies() {
  const policies = {};
  try {
    const files = fs.readdirSync(POLICY_DIR).filter(f => /^offboarding_policy_v\d+\.json$/.test(f));
    for (const file of files) {
      const raw = JSON.parse(fs.readFileSync(path.join(POLICY_DIR, file), 'utf8'));
      policies[raw.version] = raw;
    }
  } catch { /* config dir may not exist in all environments */ }
  return policies;
}

const _DEFAULT_POLICIES = loadPolicies();

// ── error helpers ─────────────────────────────────────────────────────────────

function workflowError(message, code) {
  const err = new Error(message);
  err.name = 'OffboardingWorkflowError';
  err.code = code || 'WORKFLOW_ERROR';
  return err;
}

function assert(condition, message, code) {
  if (!condition) throw workflowError(message, code);
}

function clone(v) { return JSON.parse(JSON.stringify(v)); }
function nowIso() { return new Date().toISOString(); }

// ── valid termination reasons ─────────────────────────────────────────────────

const TERMINATION_REASONS = new Set([
  'EMPLOYER_TERMINATION',
  'RESIGNATION',
  'RETIREMENT',
  'DEATH',
  'MUTUAL_AGREEMENT',
  'END_OF_CONTRACT',
]);

// ── in-memory store ───────────────────────────────────────────────────────────

/**
 * InMemoryOffboardingWorkflowStore
 *
 * Cases are stored as full documents with embedded checklist[].
 * Checklist items are never stored separately — they live inside the case.
 */
class InMemoryOffboardingWorkflowStore {
  constructor() {
    this._cases = new Map();
  }

  async insertCase(c) {
    assert(!this._cases.has(c.offboarding_case_id), `case already exists: ${c.offboarding_case_id}`, 'DUPLICATE_CASE');
    this._cases.set(c.offboarding_case_id, clone(c));
    return clone(c);
  }

  async getCase(id) {
    return this._cases.has(id) ? clone(this._cases.get(id)) : null;
  }

  async updateCase(id, patch) {
    const current = this._cases.get(id);
    assert(current, `offboarding case not found: ${id}`, 'CASE_NOT_FOUND');
    const next = { ...current, ...clone(patch) };
    this._cases.set(id, next);
    return clone(next);
  }

  async updateChecklistItem(caseId, itemId, patch) {
    const current = this._cases.get(caseId);
    assert(current, `offboarding case not found: ${caseId}`, 'CASE_NOT_FOUND');
    const idx = current.checklist.findIndex(i => i.item_id === itemId);
    assert(idx !== -1, `checklist item not found: ${itemId}`, 'ITEM_NOT_FOUND');
    current.checklist[idx] = { ...current.checklist[idx], ...clone(patch) };
    this._cases.set(caseId, current);
    return clone(current);
  }

  async allCases() {
    return Array.from(this._cases.values()).map(clone);
  }
}

// ── service factory ───────────────────────────────────────────────────────────

/**
 * createOffboardingWorkflowService({ store, hooks, evidencePackService?, policies? })
 *
 * Methods:
 *   initiateOffboarding(input)                          — create case + default checklist
 *   getChecklist(caseId)                                — return checklist items
 *   completeChecklistItem(caseId, itemId, completedBy, evidenceNote?) — mark COMPLETED
 *   canFinalize(caseId)                                 — { ok, blockers } (read-only check)
 *   finalizeOffboarding(caseId, hrApprover, esbResult?) — terminal state, auto-EP generation
 *
 * Constraints enforced at service level:
 *   - All mandatory checklist items must be COMPLETED before finalization
 *   - hrApprover must be a non-null object with approver_id (human-only gate)
 *   - FINALIZED is a terminal state — any mutation after finalization throws
 *   - EP_WOS_OFFBOARD_01 is auto-generated on finalization if evidencePackService provided
 *   - ESB calculation included in EP data_snapshot when esbResult provided
 */
function createOffboardingWorkflowService({ store, hooks, evidencePackService, policies } = {}) {
  assert(store,  'store is required');
  assert(hooks && typeof hooks.publish === 'function', 'hooks.publish is required');
  // evidencePackService is optional — absent means no EP registration (backward compatible)

  const _policies = policies || _DEFAULT_POLICIES;

  function getPolicy(version) {
    const v = version || Object.keys(_policies).sort().reverse()[0] || 'v1';
    return _policies[v] || null;
  }

  function buildChecklist(tenantChecklist) {
    // tenant_checklist overrides default when provided; otherwise use policy default
    return tenantChecklist.map(item => ({
      item_id:          item.item_id,
      title:            item.title,
      title_ar:         item.title_ar || '',
      category:         item.category || 'GENERAL',
      mandatory:        Boolean(item.mandatory),
      requires_evidence: Boolean(item.requires_evidence),
      status:           'PENDING',
      completed_by:     null,
      completed_at:     null,
      evidence_note:    null,
    }));
  }

  // ── initiateOffboarding ─────────────────────────────────────────────────────

  async function initiateOffboarding(input) {
    assert(input.offboarding_case_id, 'offboarding_case_id is required');
    assert(input.worker_id,           'worker_id is required');
    assert(input.tenant_id,           'tenant_id is required');
    assert(input.termination_reason,  'termination_reason is required');
    assert(
      TERMINATION_REASONS.has(input.termination_reason),
      `termination_reason must be one of: ${[...TERMINATION_REASONS].join(', ')}`,
      'INVALID_TERMINATION_REASON',
    );

    // Use tenant-supplied checklist or policy default
    const policy         = getPolicy(input.policy_version);
    const checklistDef   = (input.custom_checklist && input.custom_checklist.length > 0)
      ? input.custom_checklist
      : (policy ? policy.defaultChecklist : []);

    const checklist = buildChecklist(checklistDef);

    const row = await store.insertCase({
      offboarding_case_id: input.offboarding_case_id,
      tenant_id:           input.tenant_id,
      worker_id:           input.worker_id,
      termination_reason:  input.termination_reason,
      notice_date:         input.notice_date         || null,
      last_working_date:   input.last_working_date   || null,
      policy_version:      input.policy_version      || (policy ? policy.version : 'v1'),
      status:              'INITIATED',
      checklist,
      hr_approver:         null,
      evidence_pack_id:    null,
      esb_calculation:     null,
      finalized_at:        null,
      created_at:          input.created_at || nowIso(),
    });

    await hooks.publish({
      event_id:       input.event_id        || crypto.randomUUID(),
      event_type:     'OFFBOARDING_WORKFLOW_INITIATED',
      event_version:  '1.0',
      occurred_at:    input.occurred_at     || nowIso(),
      tenant_id:      input.tenant_id,
      aggregate_type: 'OFFBOARDING_CASE',
      aggregate_id:   input.offboarding_case_id,
      actor:          input.actor           || { actor_type: 'SYSTEM', actor_id: 'system' },
      correlation_id: input.correlation_id  || input.event_id || null,
      causation_id:   input.causation_id    || input.event_id || null,
      source: { service: 'lifecycle', module: 'offboarding_workflow_service', environment: process.env.NODE_ENV || 'development' },
      trust_level:        'STANDARD',
      requires_approval:  false,
      payload: {
        offboarding_case_id: row.offboarding_case_id,
        worker_id:           row.worker_id,
        termination_reason:  row.termination_reason,
        checklist_item_count: checklist.length,
        mandatory_count:      checklist.filter(i => i.mandatory).length,
      },
      metadata: input.metadata || {},
    });

    return row;
  }

  // ── getChecklist ────────────────────────────────────────────────────────────

  async function getChecklist(caseId) {
    assert(caseId, 'caseId is required');
    const c = await store.getCase(caseId);
    assert(c, `offboarding case not found: ${caseId}`, 'CASE_NOT_FOUND');
    return clone(c.checklist);
  }

  // ── completeChecklistItem ───────────────────────────────────────────────────

  async function completeChecklistItem(caseId, itemId, completedBy, evidenceNote) {
    assert(caseId,      'caseId is required');
    assert(itemId,      'itemId is required');
    assert(completedBy, 'completedBy is required');

    const current = await store.getCase(caseId);
    assert(current, `offboarding case not found: ${caseId}`, 'CASE_NOT_FOUND');
    assert(
      current.status !== 'FINALIZED',
      `offboarding case ${caseId} is already FINALIZED — no further modifications permitted`,
      'CASE_FINALIZED',
    );

    const updated = await store.updateChecklistItem(caseId, itemId, {
      status:        'COMPLETED',
      completed_by:  completedBy,
      completed_at:  nowIso(),
      evidence_note: evidenceNote || null,
    });

    // Advance status to IN_PROGRESS once any item completed
    if (updated.status === 'INITIATED') {
      await store.updateCase(caseId, { status: 'IN_PROGRESS' });
    }

    return updated.checklist.find(i => i.item_id === itemId);
  }

  // ── canFinalize ─────────────────────────────────────────────────────────────

  async function canFinalize(caseId) {
    assert(caseId, 'caseId is required');
    const c = await store.getCase(caseId);
    assert(c, `offboarding case not found: ${caseId}`, 'CASE_NOT_FOUND');

    const blockers = [];

    if (c.status === 'FINALIZED') {
      blockers.push('case is already FINALIZED');
    }

    const incompleteMandatory = (c.checklist || []).filter(
      i => i.mandatory && i.status !== 'COMPLETED',
    );
    incompleteMandatory.forEach(i => {
      blockers.push(`mandatory item incomplete: ${i.item_id} — ${i.title}`);
    });

    return { ok: blockers.length === 0, blockers };
  }

  // ── finalizeOffboarding ─────────────────────────────────────────────────────

  async function finalizeOffboarding(caseId, hrApprover, esbResult) {
    assert(caseId, 'caseId is required');
    assert(
      hrApprover && hrApprover.approver_id,
      'hrApprover with approver_id is required — finalization requires human HR approval',
      'HR_APPROVER_REQUIRED',
    );

    const current = await store.getCase(caseId);
    assert(current, `offboarding case not found: ${caseId}`, 'CASE_NOT_FOUND');

    // Terminal state guard — no re-finalization
    assert(
      current.status !== 'FINALIZED',
      `offboarding case ${caseId} is already FINALIZED — terminal state cannot be reversed`,
      'CASE_ALREADY_FINALIZED',
    );

    // Mandatory items gate — block finalization if any mandatory item incomplete
    const incompleteMandatory = current.checklist.filter(i => i.mandatory && i.status !== 'COMPLETED');
    if (incompleteMandatory.length > 0) {
      const missing = incompleteMandatory.map(i => `${i.item_id}(${i.title})`).join(', ');
      throw workflowError(
        `Cannot finalize: ${incompleteMandatory.length} mandatory checklist item(s) not COMPLETED: ${missing}`,
        'MANDATORY_ITEMS_INCOMPLETE',
      );
    }

    const finalizedAt = nowIso();
    const approvalRecord = {
      approver_id:   hrApprover.approver_id,
      approver_name: hrApprover.approver_name || hrApprover.approver_id,
      approver_role: hrApprover.approver_role || 'HR',
      decision:      'APPROVED',
      approved_at:   finalizedAt,
      notes:         hrApprover.notes || null,
    };

    // Auto-generate EP_WOS_OFFBOARD_01 — mandatory on finalization
    let evidencePackId = null;
    if (evidencePackService) {
      evidencePackId = crypto.randomUUID();

      const dataSnapshot = {
        offboarding_case_id: current.offboarding_case_id,
        worker_id:           current.worker_id,
        termination_reason:  current.termination_reason,
        notice_date:         current.notice_date,
        last_working_date:   current.last_working_date,
        policy_version:      current.policy_version,
        checklist_summary:   current.checklist.map(i => ({
          item_id:      i.item_id,
          title:        i.title,
          mandatory:    i.mandatory,
          status:       i.status,
          completed_by: i.completed_by,
          completed_at: i.completed_at,
        })),
        hr_approval: approvalRecord,
        // S38-G4: include ESB calculation if provided
        esb_calculation: esbResult ? {
          calculation_id: esbResult.calculationId,
          policy_version: esbResult.policyVersion,
          net_esb:        esbResult.netEsb,
          gross_esb:      esbResult.grossEsb,
          years_of_service: esbResult.yearsOfService,
          modifier:       esbResult.modifier,
          modifier_label: esbResult.modifierLabel,
          disclaimer:     esbResult.disclaimer,
        } : null,
      };

      await evidencePackService.create({
        pack_id:         evidencePackId,
        pack_type:       'EP_WOS_OFFBOARD_01',
        tenant_id:       current.tenant_id,
        actor: {
          actor_id:   hrApprover.approver_id,
          actor_name: hrApprover.approver_name || hrApprover.approver_id,
          actor_role: hrApprover.approver_role || 'HR',
        },
        action:          `Offboarding finalized for worker ${current.worker_id} — ${current.termination_reason}`,
        data_snapshot:   dataSnapshot,
        attached_files:  [],
        approval_chain:  [approvalRecord],
        ai_artifacts:    [],
        redaction_rules: [],
      });
    }

    // Commit terminal state
    const finalized = await store.updateCase(caseId, {
      status:           'FINALIZED',
      hr_approver:      approvalRecord,
      evidence_pack_id: evidencePackId,
      esb_calculation:  esbResult ? { netEsb: esbResult.netEsb, policyVersion: esbResult.policyVersion } : null,
      finalized_at:     finalizedAt,
    });

    await hooks.publish({
      event_id:       crypto.randomUUID(),
      event_type:     'OFFBOARDING_FINALIZED',
      event_version:  '1.0',
      occurred_at:    finalizedAt,
      tenant_id:      current.tenant_id,
      aggregate_type: 'OFFBOARDING_CASE',
      aggregate_id:   caseId,
      actor: {
        actor_id:   hrApprover.approver_id,
        actor_type: 'HR',
        actor_name: hrApprover.approver_name || hrApprover.approver_id,
      },
      correlation_id: null,
      causation_id:   null,
      source: { service: 'lifecycle', module: 'offboarding_workflow_service', environment: process.env.NODE_ENV || 'development' },
      trust_level:       'HIGH',
      requires_approval: false,  // approval already captured via hrApprover
      payload: {
        offboarding_case_id: caseId,
        worker_id:           current.worker_id,
        termination_reason:  current.termination_reason,
        evidence_pack_id:    evidencePackId,
        esb_included:        Boolean(esbResult),
        checklist_count:     current.checklist.length,
        finalized_at:        finalizedAt,
      },
      metadata: {},
    });

    return finalized;
  }

  // ── getCase (convenience) ───────────────────────────────────────────────────

  async function getCase(caseId) {
    assert(caseId, 'caseId is required');
    return store.getCase(caseId);
  }

  return {
    initiateOffboarding,
    getChecklist,
    completeChecklistItem,
    canFinalize,
    finalizeOffboarding,
    getCase,
    // Exposed for testing
    _policies,
  };
}

module.exports = {
  createOffboardingWorkflowService,
  InMemoryOffboardingWorkflowStore,
};
