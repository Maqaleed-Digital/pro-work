'use strict';

const path = require('path');
const fs   = require('fs');

const POLICY = JSON.parse(
  fs.readFileSync(
    path.join(__dirname, '../../config/compliance/probation_policy_v1.json'),
    'utf8'
  )
);

const MAX_TOTAL_DAYS     = POLICY.maxTotalDays;         // 180
const DAY80_TRIGGER      = POLICY.day80TriggerDayNumber; // 80
const TERM_REASON_CODES  = new Set(POLICY.terminationReasonCodes);
const EXT_REASON_CODES   = new Set(POLICY.extensionReasonCodes);
const CONF_REASON_CODES  = new Set(POLICY.confirmReasonCodes);
const SETTLEMENT_ITEMS   = POLICY.settlementChecklistItems;

// ── helpers ───────────────────────────────────────────────────────────────────

function govError(message) {
  const err = new Error(message);
  err.name = 'ProbationGovernanceError';
  return err;
}

function assert(condition, message) {
  if (!condition) throw govError(message);
}

function clone(v) { return JSON.parse(JSON.stringify(v)); }

function nowIso() { return new Date().toISOString(); }

/** Days elapsed from ISO start date to now (or injected now). */
function daysSince(startIso, now) {
  const startMs = new Date(startIso).getTime();
  const nowMs   = (now instanceof Date ? now : new Date(now || Date.now())).getTime();
  return Math.floor((nowMs - startMs) / 86_400_000);
}

/** Maximum end date for a case (start + MAX_TOTAL_DAYS). */
function maxEndDate(startIso) {
  const d = new Date(startIso);
  d.setDate(d.getDate() + MAX_TOTAL_DAYS);
  return d.toISOString();
}

// ── In-memory store ───────────────────────────────────────────────────────────

class InMemoryProbationGovernanceStore {
  constructor() {
    this._cases = new Map();
  }

  async insert(record) {
    const key = record.governance_case_id;
    assert(key, 'governance_case_id is required');
    assert(!this._cases.has(key), `governance case already exists: ${key}`);
    const frozen = Object.freeze(clone(record));
    this._cases.set(key, frozen);
    return clone(frozen);
  }

  async update(id, patch) {
    const existing = this._cases.get(id);
    assert(existing, `governance case not found: ${id}`);
    // Unfreeze existing, merge patch, re-freeze
    const next = Object.freeze(clone({ ...existing, ...patch }));
    this._cases.set(id, next);
    return clone(next);
  }

  async get(id) {
    return this._cases.has(id) ? clone(this._cases.get(id)) : null;
  }

  async findByWorkerId(workerId) {
    return Array.from(this._cases.values())
      .filter(r => r.worker_id === workerId)
      .map(clone);
  }

  /** Find all cases where day-80 trigger is due but pack not yet compiled. */
  async findDay80Due(now) {
    return Array.from(this._cases.values())
      .filter(r => {
        if (r.status !== 'ACTIVE') return false;
        if (r.evidence_pack_compiled_at) return false;  // idempotent guard
        return daysSince(r.started_at, now) >= DAY80_TRIGGER;
      })
      .map(clone);
  }

  async allCases() {
    return Array.from(this._cases.values()).map(clone);
  }
}

// ── Service factory ───────────────────────────────────────────────────────────

function createProbationGovernanceService({ store, hooks }) {
  assert(store,  'store is required');
  assert(hooks && typeof hooks.publish === 'function', 'hooks.publish is required');

  /**
   * initiateProbation — opens a new governance case.
   * periodDays must be 90 or 180 (per policy).
   */
  async function initiateProbation(input) {
    assert(input && typeof input === 'object', 'input is required');
    assert(input.governance_case_id, 'governance_case_id is required');
    assert(input.worker_id,          'worker_id is required');
    assert(input.tenant_id,          'tenant_id is required');
    assert(input.onboarding_case_id, 'onboarding_case_id is required');
    assert(input.started_at,         'started_at is required');

    const periodDays = input.period_days || POLICY.defaultPeriodDays;
    assert(
      POLICY.probationPeriods.includes(periodDays),
      `period_days must be one of: ${POLICY.probationPeriods.join(', ')}`
    );

    const record = {
      governance_case_id:       input.governance_case_id,
      worker_id:                input.worker_id,
      tenant_id:                input.tenant_id,
      onboarding_case_id:       input.onboarding_case_id,
      period_days:              periodDays,
      started_at:               input.started_at,
      max_end_date:             maxEndDate(input.started_at),
      status:                   'ACTIVE',
      decision_status:          'PENDING',
      decision:                 null,
      decision_made_by:         null,
      decision_at:              null,
      reason_code:              null,
      extension_days:           0,
      termination_reason_code:  null,
      notice_details:           null,
      settlement_checklist:     null,
      evidence_signals:         {},
      evidence_pack_compiled_at: null,
      evidence_pack_id:         null,
      created_at:               input.occurred_at || nowIso(),
      policy_version:           POLICY.version,
    };

    const stored = await store.insert(record);

    await hooks.publish({
      event_id:       input.event_id,
      event_type:     'PROBATION_INITIATED',
      event_version:  '1.0',
      occurred_at:    input.occurred_at || nowIso(),
      tenant_id:      input.tenant_id,
      aggregate_type: 'ONBOARDING_CASE',
      aggregate_id:   input.onboarding_case_id,
      actor:          input.actor,
      correlation_id: input.correlation_id,
      causation_id:   input.causation_id,
      source: { service: 'onboarding', module: 'probation_governance_service', environment: process.env.NODE_ENV || 'development' },
      trust_level: 'HIGH', requires_approval: false,
      payload: { governance_case_id: stored.governance_case_id, worker_id: stored.worker_id, period_days: stored.period_days },
      metadata: input.metadata || {},
    });

    return stored;
  }

  /**
   * getStatus — returns live status including calculated day number.
   * Pass `now` (ISO string or Date) for testability; defaults to system clock.
   */
  function getStatus(record, now) {
    assert(record && record.governance_case_id, 'record is required');
    const currentDay     = daysSince(record.started_at, now);
    const daysRemaining  = Math.max(0, record.period_days - currentDay);
    const day80Sent      = record.evidence_pack_compiled_at != null;

    let statusLabel = 'ON_TRACK';
    if (record.decision_status !== 'PENDING') {
      statusLabel = 'DECIDED';
    } else if (currentDay >= record.period_days) {
      statusLabel = 'DECISION_REQUIRED';
    } else if (day80Sent || currentDay >= DAY80_TRIGGER) {
      statusLabel = 'EVIDENCE_READY';
    }

    return {
      governance_case_id:       record.governance_case_id,
      worker_id:                record.worker_id,
      period_days:              record.period_days,
      current_day:              currentDay,
      days_remaining:           daysRemaining,
      day80_pack_compiled:      day80Sent,
      evidence_pack_compiled_at: record.evidence_pack_compiled_at,
      status_label:             statusLabel,
      decision_status:          record.decision_status,
      decision:                 record.decision,
      decision_made_by:         record.decision_made_by,
      decision_at:              record.decision_at,
      max_end_date:             record.max_end_date,
    };
  }

  /**
   * compileProbationEvidencePack — gathers all evidence signals and marks pack compiled.
   * Idempotent: if already compiled, returns existing record unchanged.
   */
  async function compileProbationEvidencePack(input) {
    assert(input.governance_case_id, 'governance_case_id is required');

    const current = await store.get(input.governance_case_id);
    assert(current, `governance case not found: ${input.governance_case_id}`);

    // Idempotent: already compiled
    if (current.evidence_pack_compiled_at) {
      return clone(current);
    }

    const signals = {
      task_completion_count:   input.task_completion_count   ?? 0,
      manager_review_count:    input.manager_review_count    ?? 0,
      policy_ack_count:        input.policy_ack_count        ?? 0,
      attendance_signal_count: input.attendance_signal_count ?? 0,
      extension_agreement:     input.extension_agreement     ?? null,
    };

    const epId = input.evidence_pack_id || `ep-prob-${input.governance_case_id}`;

    const updated = await store.update(input.governance_case_id, {
      evidence_signals:         signals,
      evidence_pack_compiled_at: input.compiled_at || nowIso(),
      evidence_pack_id:         epId,
    });

    await hooks.publish({
      event_id:       input.event_id,
      event_type:     'PROBATION_EVIDENCE_PACK_COMPILED',
      event_version:  '1.0',
      occurred_at:    input.compiled_at || nowIso(),
      tenant_id:      updated.tenant_id,
      aggregate_type: 'ONBOARDING_CASE',
      aggregate_id:   updated.onboarding_case_id,
      actor:          input.actor || { actor_type: 'SYSTEM', actor_id: 'day80-automation' },
      correlation_id: input.correlation_id,
      causation_id:   input.causation_id,
      source: { service: 'onboarding', module: 'probation_governance_service', environment: process.env.NODE_ENV || 'development' },
      trust_level: 'HIGH', requires_approval: false,
      payload: {
        governance_case_id:      updated.governance_case_id,
        worker_id:               updated.worker_id,
        evidence_pack_id:        epId,
        task_completion_count:   signals.task_completion_count,
        manager_review_count:    signals.manager_review_count,
        policy_ack_count:        signals.policy_ack_count,
      },
      metadata: input.metadata || {},
    });

    return updated;
  }

  /**
   * recordDecision — human-only decision gate.
   * actor MUST be provided (HUMAN type enforced).
   * TERMINATE requires terminationReasonCode + noticeDetails + settlementChecklist.
   * EXTEND validates total period does not exceed maxTotalDays from start.
   */
  async function recordDecision(input) {
    assert(input.governance_case_id, 'governance_case_id is required');
    assert(input.decision, 'decision is required');
    assert(input.reason_code, 'reason_code is required');
    assert(input.actor && input.actor.actor_id, 'actor.actor_id is required');
    assert(
      input.actor.actor_type === 'HUMAN',
      'probation decisions require HUMAN actor — auto-decision is not permitted'
    );
    assert(
      ['CONFIRM', 'EXTEND', 'TERMINATE'].includes(input.decision),
      'decision must be CONFIRM | EXTEND | TERMINATE'
    );

    const current = await store.get(input.governance_case_id);
    assert(current, `governance case not found: ${input.governance_case_id}`);
    assert(current.status === 'ACTIVE', 'probation case is not active');
    assert(current.decision_status === 'PENDING', 'decision already recorded');

    // Decision-specific validation
    if (input.decision === 'CONFIRM') {
      assert(CONF_REASON_CODES.has(input.reason_code), `reason_code must be one of: ${[...CONF_REASON_CODES].join(', ')}`);
    }

    if (input.decision === 'EXTEND') {
      assert(EXT_REASON_CODES.has(input.reason_code), `reason_code must be one of: ${[...EXT_REASON_CODES].join(', ')}`);
      assert(input.extension_days > 0, 'extension_days must be > 0');
      // Extension max: total from start date must not exceed MAX_TOTAL_DAYS
      const newTotal = current.period_days + input.extension_days;
      assert(
        newTotal <= MAX_TOTAL_DAYS,
        `extension would exceed maximum of ${MAX_TOTAL_DAYS} days from start date (current: ${current.period_days}, requesting +${input.extension_days}, total would be ${newTotal})`
      );
    }

    if (input.decision === 'TERMINATE') {
      assert(TERM_REASON_CODES.has(input.reason_code), `reason_code must be one of: ${[...TERM_REASON_CODES].join(', ')}`);
      assert(input.termination_reason_code, 'termination_reason_code is required for TERMINATE');
      assert(input.notice_details && typeof input.notice_details === 'object', 'notice_details is required for TERMINATE');
      assert(
        Array.isArray(input.settlement_checklist) && input.settlement_checklist.length > 0,
        'settlement_checklist is required for TERMINATE'
      );
      // Validate all required settlement items are present
      const missingItems = SETTLEMENT_ITEMS.filter(item => !input.settlement_checklist.includes(item));
      assert(missingItems.length === 0, `settlement_checklist missing required items: ${missingItems.join(', ')}`);
    }

    const patch = {
      decision:                 input.decision,
      decision_status:          input.decision,
      decision_made_by:         input.actor.actor_id,
      decision_at:              input.decision_at || nowIso(),
      reason_code:              input.reason_code,
    };

    if (input.decision === 'EXTEND') {
      patch.extension_days  = input.extension_days;
      patch.period_days     = current.period_days + input.extension_days;
    }

    if (input.decision === 'TERMINATE') {
      patch.status                   = 'TERMINATED';
      patch.termination_reason_code  = input.termination_reason_code;
      patch.notice_details           = input.notice_details;
      patch.settlement_checklist     = input.settlement_checklist;
    }

    if (input.decision === 'CONFIRM') {
      patch.status = 'CONFIRMED';
    }

    const updated = await store.update(input.governance_case_id, patch);

    await hooks.publish({
      event_id:       input.event_id,
      event_type:     'PROBATION_DECISION_RECORDED',
      event_version:  '1.0',
      occurred_at:    input.decision_at || nowIso(),
      tenant_id:      updated.tenant_id,
      aggregate_type: 'ONBOARDING_CASE',
      aggregate_id:   updated.onboarding_case_id,
      actor:          input.actor,
      correlation_id: input.correlation_id,
      causation_id:   input.causation_id,
      source: { service: 'onboarding', module: 'probation_governance_service', environment: process.env.NODE_ENV || 'development' },
      trust_level: 'HIGH', requires_approval: false,
      payload: {
        governance_case_id: updated.governance_case_id,
        worker_id:          updated.worker_id,
        decision:           updated.decision,
        reason_code:        updated.reason_code,
        decision_made_by:   updated.decision_made_by,
      },
      metadata: input.metadata || {},
    });

    return updated;
  }

  return {
    initiateProbation,
    getStatus,
    compileProbationEvidencePack,
    recordDecision,
    POLICY,
  };
}

module.exports = {
  createProbationGovernanceService,
  InMemoryProbationGovernanceStore,
  POLICY,
  daysSince,
};
