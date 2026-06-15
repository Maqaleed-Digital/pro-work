'use strict';

/**
 * S39-G1 — SDP (Skill Development Programme) Core Service
 *
 * Key design constraints (non-negotiable):
 *   - start_date + end_date MANDATORY on every programme — no open-ended programmes
 *   - end_date must be after start_date
 *   - FORBIDDEN_FIELDS structurally rejected at input boundary — not a warning,
 *     throws FORBIDDEN_FIELD so the forbidden data can never reach the store
 *
 * Forbidden field categories (structural prohibition):
 *   shift_*          — SDP is NOT shift scheduling
 *   attendance_*     — SDP has no attendance tracking
 *   exclusive_*      / exclusivity / lock_worker — SDP has no worker exclusivity
 *
 * Methods:
 *   createProgramme(input)                          — create SDP programme
 *   updateProgramme(programmeId, patch)             — update mutable fields (not dates once OPEN)
 *   getProgramme(programmeId)                       — fetch programme
 *   listProgrammes(tenantId, filters?)              — list tenant programmes
 *   enrolWorker(programmeId, workerId, tenantId, enrolledBy?) — enrol worker
 *   withdrawWorker(programmeId, workerId, reason?)  — withdraw enrolment
 *   completeEnrolment(programmeId, workerId, outcome, completedBy) — finalise enrolment
 *   getProgrammeEnrolments(programmeId)             — enrolments for a programme
 *   getWorkerEnrolments(workerId, tenantId?)        — all enrolments for a worker
 */

const path   = require('path');
const fs     = require('fs');
const crypto = require('crypto');

// ── load policy ───────────────────────────────────────────────────────────────

const POLICY_DIR = path.join(__dirname, '../../config/sdp');

function loadPolicies() {
  const policies = {};
  try {
    const files = fs.readdirSync(POLICY_DIR).filter(f => /^sdp_policy_v\d+\.json$/.test(f));
    for (const file of files) {
      const raw = JSON.parse(fs.readFileSync(path.join(POLICY_DIR, file), 'utf8'));
      policies[raw.version] = raw;
    }
  } catch { /* config dir may not exist in all environments */ }
  return policies;
}

const _DEFAULT_POLICIES = loadPolicies();

// ── structural forbidden-field set ───────────────────────────────────────────
//
// These fields CANNOT appear in any SDP programme input.
// SDP is a time-boxed skill development programme only.
// It is NOT: shift scheduling, attendance tracking, or worker exclusivity.

const FORBIDDEN_FIELDS = new Set([
  // shift scheduling — forbidden category 1
  'shift_id',
  'shift_schedule',
  'shift_start',
  'shift_end',
  'shift_type',
  'shift_pattern',
  // attendance tracking — forbidden category 2
  'attendance',
  'attendance_required',
  'attendance_tracking',
  'attendance_rate',
  'attendance_log',
  // worker exclusivity — forbidden category 3
  'exclusive',
  'exclusivity',
  'lock_worker',
  'exclusive_worker',
  'schedule_lock',
  'scheduling_block',
  'worker_lock',
]);

// ── error helpers ─────────────────────────────────────────────────────────────

function sdpError(message, code) {
  const err = new Error(message);
  err.name = 'SdpServiceError';
  err.code = code || 'SDP_ERROR';
  return err;
}

function assert(condition, message, code) {
  if (!condition) throw sdpError(message, code);
}

function clone(v) { return JSON.parse(JSON.stringify(v)); }
function nowIso() { return new Date().toISOString(); }

// ── forbidden-field guard — called at every input boundary ────────────────────

function rejectForbiddenFields(input) {
  for (const key of Object.keys(input)) {
    if (FORBIDDEN_FIELDS.has(key)) {
      throw sdpError(
        `Field "${key}" is structurally forbidden in SDP programmes. ` +
        `SDP is time-boxed skill development only — it is not shift scheduling, ` +
        `attendance tracking, or worker exclusivity.`,
        'FORBIDDEN_FIELD',
      );
    }
  }
}

// ── valid sets ────────────────────────────────────────────────────────────────

const VALID_STATUSES    = new Set(['DRAFT', 'OPEN', 'CLOSED', 'CANCELLED', 'COMPLETED']);
const VALID_OUTCOMES    = new Set(['PASSED', 'FAILED', 'WITHDRAWN', 'INCOMPLETE']);
const ENROLMENT_TERMINAL = new Set(['COMPLETED', 'WITHDRAWN']);

// ── in-memory stores ──────────────────────────────────────────────────────────

class InMemorySdpStore {
  constructor() {
    this._programmes  = new Map();
    this._enrolments  = new Map();  // key: `${programmeId}::${workerId}`
  }

  // ── programmes ──────────────────────────────────────────────────────────────

  async insertProgramme(p) {
    assert(!this._programmes.has(p.programme_id), `programme already exists: ${p.programme_id}`, 'DUPLICATE_PROGRAMME');
    this._programmes.set(p.programme_id, clone(p));
    return clone(p);
  }

  async getProgramme(id) {
    return this._programmes.has(id) ? clone(this._programmes.get(id)) : null;
  }

  async updateProgramme(id, patch) {
    const current = this._programmes.get(id);
    assert(current, `programme not found: ${id}`, 'PROGRAMME_NOT_FOUND');
    const next = { ...current, ...clone(patch) };
    this._programmes.set(id, next);
    return clone(next);
  }

  async allProgrammes(tenantId) {
    const all = Array.from(this._programmes.values()).map(clone);
    return tenantId ? all.filter(p => p.tenant_id === tenantId) : all;
  }

  // ── enrolments ──────────────────────────────────────────────────────────────

  async insertEnrolment(e) {
    const key = `${e.programme_id}::${e.worker_id}`;
    assert(!this._enrolments.has(key), `worker ${e.worker_id} already enrolled in programme ${e.programme_id}`, 'DUPLICATE_ENROLMENT');
    this._enrolments.set(key, clone(e));
    return clone(e);
  }

  async getEnrolment(programmeId, workerId) {
    const key = `${programmeId}::${workerId}`;
    return this._enrolments.has(key) ? clone(this._enrolments.get(key)) : null;
  }

  async updateEnrolment(programmeId, workerId, patch) {
    const key = `${programmeId}::${workerId}`;
    const current = this._enrolments.get(key);
    assert(current, `enrolment not found: worker ${workerId} in programme ${programmeId}`, 'ENROLMENT_NOT_FOUND');
    const next = { ...current, ...clone(patch) };
    this._enrolments.set(key, next);
    return clone(next);
  }

  async enrolmentsForProgramme(programmeId) {
    return Array.from(this._enrolments.values())
      .filter(e => e.programme_id === programmeId)
      .map(clone);
  }

  async enrolmentsForWorker(workerId, tenantId) {
    return Array.from(this._enrolments.values())
      .filter(e => e.worker_id === workerId && (!tenantId || e.tenant_id === tenantId))
      .map(clone);
  }
}

// ── service factory ───────────────────────────────────────────────────────────

function createSdpService({ store, hooks, policies } = {}) {
  assert(store, 'store is required');
  assert(hooks && typeof hooks.publish === 'function', 'hooks.publish is required');

  const _policies = policies || _DEFAULT_POLICIES;

  function getActivePolicy() {
    const versions = Object.keys(_policies).sort().reverse();
    return versions.length > 0 ? _policies[versions[0]] : null;
  }

  // ── createProgramme ─────────────────────────────────────────────────────────

  async function createProgramme(input) {
    // ── Structural gate: forbidden fields rejected at input boundary ──────────
    rejectForbiddenFields(input);

    assert(input.programme_id, 'programme_id is required');
    assert(input.tenant_id,    'tenant_id is required');
    assert(input.title,        'title is required');
    assert(input.start_date,   'start_date is required — SDP programmes must be time-boxed');
    assert(input.end_date,     'end_date is required — SDP programmes must be time-boxed');

    const startMs = new Date(input.start_date).getTime();
    const endMs   = new Date(input.end_date).getTime();
    assert(
      !isNaN(startMs),
      'start_date must be a valid date',
      'INVALID_DATE',
    );
    assert(
      !isNaN(endMs),
      'end_date must be a valid date',
      'INVALID_DATE',
    );
    assert(
      endMs > startMs,
      `end_date (${input.end_date}) must be after start_date (${input.start_date})`,
      'INVALID_DATE_RANGE',
    );

    const policy = getActivePolicy();
    if (policy && policy.maxDurationDays) {
      const durationDays = (endMs - startMs) / 86400000;
      assert(
        durationDays <= policy.maxDurationDays,
        `programme duration ${Math.ceil(durationDays)} days exceeds maximum ${policy.maxDurationDays} days`,
        'DURATION_EXCEEDED',
      );
    }

    const programme = await store.insertProgramme({
      programme_id: input.programme_id,
      tenant_id:    input.tenant_id,
      title:        input.title,
      title_ar:     input.title_ar     || null,
      description:  input.description  || null,
      category:     input.category     || 'GENERAL',
      start_date:   input.start_date,
      end_date:     input.end_date,
      capacity:     input.capacity     || (policy ? policy.constraints.max_capacity_default : 50),
      status:       'OPEN',
      created_by:   input.created_by   || null,
      created_at:   input.created_at   || nowIso(),
    });

    await hooks.publish({
      event_id:       input.event_id     || crypto.randomUUID(),
      event_type:     'SDP_PROGRAMME_CREATED',
      event_version:  '1.0',
      occurred_at:    programme.created_at,
      tenant_id:      input.tenant_id,
      aggregate_type: 'SDP_PROGRAMME',
      aggregate_id:   programme.programme_id,
      actor:          input.actor || { actor_type: 'HR', actor_id: input.created_by || 'system' },
      correlation_id: input.correlation_id || null,
      causation_id:   null,
      source: { service: 'sdp', module: 'sdp_service', environment: process.env.NODE_ENV || 'development' },
      trust_level:        'STANDARD',
      requires_approval:  false,
      payload: {
        programme_id: programme.programme_id,
        title:        programme.title,
        category:     programme.category,
        start_date:   programme.start_date,
        end_date:     programme.end_date,
        capacity:     programme.capacity,
      },
      metadata: input.metadata || {},
    });

    return programme;
  }

  // ── updateProgramme ─────────────────────────────────────────────────────────

  async function updateProgramme(programmeId, patch) {
    rejectForbiddenFields(patch);

    const current = await store.getProgramme(programmeId);
    assert(current, `programme not found: ${programmeId}`, 'PROGRAMME_NOT_FOUND');
    assert(
      current.status !== 'CANCELLED',
      `programme ${programmeId} is CANCELLED — no modifications permitted`,
      'PROGRAMME_CANCELLED',
    );

    // Protect immutable fields
    const { programme_id: _id, tenant_id: _tid, created_at: _ca, ...safePatch } = patch;

    return store.updateProgramme(programmeId, { ...safePatch, updated_at: nowIso() });
  }

  // ── getProgramme ────────────────────────────────────────────────────────────

  async function getProgramme(programmeId) {
    assert(programmeId, 'programmeId is required');
    const p = await store.getProgramme(programmeId);
    assert(p, `programme not found: ${programmeId}`, 'PROGRAMME_NOT_FOUND');
    return p;
  }

  // ── listProgrammes ──────────────────────────────────────────────────────────

  async function listProgrammes(tenantId, filters = {}) {
    const all = await store.allProgrammes(tenantId);
    let result = all;
    if (filters.status)   result = result.filter(p => p.status   === filters.status);
    if (filters.category) result = result.filter(p => p.category === filters.category);
    return result;
  }

  // ── enrolWorker ─────────────────────────────────────────────────────────────

  async function enrolWorker(programmeId, workerId, tenantId, enrolledBy) {
    assert(programmeId, 'programmeId is required');
    assert(workerId,    'workerId is required');
    assert(tenantId,    'tenantId is required');

    const programme = await store.getProgramme(programmeId);
    assert(programme, `programme not found: ${programmeId}`, 'PROGRAMME_NOT_FOUND');
    assert(
      programme.status === 'OPEN',
      `programme ${programmeId} is ${programme.status} — enrolment not permitted`,
      'PROGRAMME_NOT_OPEN',
    );

    // Capacity check
    const existing = await store.enrolmentsForProgramme(programmeId);
    const active   = existing.filter(e => e.status === 'ENROLLED');
    assert(
      active.length < programme.capacity,
      `programme ${programmeId} is at capacity (${programme.capacity})`,
      'PROGRAMME_FULL',
    );

    const enrolledAt = nowIso();
    const enrolment = await store.insertEnrolment({
      enrolment_id: crypto.randomUUID(),
      programme_id: programmeId,
      worker_id:    workerId,
      tenant_id:    tenantId,
      status:       'ENROLLED',
      enrolled_at:  enrolledAt,
      enrolled_by:  enrolledBy || null,
      completed_at: null,
      outcome:      null,
    });

    await hooks.publish({
      event_id:       crypto.randomUUID(),
      event_type:     'SDP_WORKER_ENROLLED',
      event_version:  '1.0',
      occurred_at:    enrolledAt,
      tenant_id:      tenantId,
      aggregate_type: 'SDP_ENROLMENT',
      aggregate_id:   enrolment.enrolment_id,
      actor:          { actor_type: 'HR', actor_id: enrolledBy || 'system' },
      correlation_id: null,
      causation_id:   null,
      source: { service: 'sdp', module: 'sdp_service', environment: process.env.NODE_ENV || 'development' },
      trust_level:        'STANDARD',
      requires_approval:  false,
      payload: { programme_id: programmeId, worker_id: workerId, tenant_id: tenantId },
      metadata: {},
    });

    return enrolment;
  }

  // ── withdrawWorker ──────────────────────────────────────────────────────────

  async function withdrawWorker(programmeId, workerId, reason) {
    assert(programmeId, 'programmeId is required');
    assert(workerId,    'workerId is required');

    const enrolment = await store.getEnrolment(programmeId, workerId);
    assert(enrolment, `enrolment not found: worker ${workerId} in programme ${programmeId}`, 'ENROLMENT_NOT_FOUND');
    assert(
      !ENROLMENT_TERMINAL.has(enrolment.status),
      `enrolment is already ${enrolment.status} — withdrawal not permitted`,
      'ENROLMENT_TERMINAL',
    );

    return store.updateEnrolment(programmeId, workerId, {
      status:       'WITHDRAWN',
      completed_at: nowIso(),
      outcome:      'WITHDRAWN',
      withdrawal_reason: reason || null,
    });
  }

  // ── completeEnrolment ───────────────────────────────────────────────────────

  async function completeEnrolment(programmeId, workerId, outcome, completedBy) {
    assert(programmeId, 'programmeId is required');
    assert(workerId,    'workerId is required');
    assert(outcome,     'outcome is required');
    assert(completedBy, 'completedBy is required');
    assert(
      VALID_OUTCOMES.has(outcome),
      `outcome must be one of: ${[...VALID_OUTCOMES].join(', ')}`,
      'INVALID_OUTCOME',
    );

    const enrolment = await store.getEnrolment(programmeId, workerId);
    assert(enrolment, `enrolment not found: worker ${workerId} in programme ${programmeId}`, 'ENROLMENT_NOT_FOUND');
    assert(
      !ENROLMENT_TERMINAL.has(enrolment.status),
      `enrolment is already ${enrolment.status} — completion not permitted`,
      'ENROLMENT_TERMINAL',
    );

    const completedAt = nowIso();
    const updated = await store.updateEnrolment(programmeId, workerId, {
      status:       'COMPLETED',
      completed_at: completedAt,
      outcome,
      completed_by: completedBy,
    });

    await hooks.publish({
      event_id:       crypto.randomUUID(),
      event_type:     'SDP_ENROLMENT_COMPLETED',
      event_version:  '1.0',
      occurred_at:    completedAt,
      tenant_id:      enrolment.tenant_id,
      aggregate_type: 'SDP_ENROLMENT',
      aggregate_id:   enrolment.enrolment_id,
      actor:          { actor_type: 'HR', actor_id: completedBy },
      correlation_id: null,
      causation_id:   null,
      source: { service: 'sdp', module: 'sdp_service', environment: process.env.NODE_ENV || 'development' },
      trust_level:        'STANDARD',
      requires_approval:  false,
      payload: { programme_id: programmeId, worker_id: workerId, outcome, completed_by: completedBy },
      metadata: {},
    });

    return updated;
  }

  // ── getProgrammeEnrolments ──────────────────────────────────────────────────

  async function getProgrammeEnrolments(programmeId) {
    assert(programmeId, 'programmeId is required');
    return store.enrolmentsForProgramme(programmeId);
  }

  // ── getWorkerEnrolments ─────────────────────────────────────────────────────

  async function getWorkerEnrolments(workerId, tenantId) {
    assert(workerId, 'workerId is required');
    return store.enrolmentsForWorker(workerId, tenantId);
  }

  return {
    createProgramme,
    updateProgramme,
    getProgramme,
    listProgrammes,
    enrolWorker,
    withdrawWorker,
    completeEnrolment,
    getProgrammeEnrolments,
    getWorkerEnrolments,
    _policies,
  };
}

module.exports = {
  createSdpService,
  InMemorySdpStore,
  FORBIDDEN_FIELDS,
};
