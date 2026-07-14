'use strict';

const crypto = require('crypto');
const path   = require('path');
const fs     = require('fs');

// DL-VER-BPS-001 / DL-068 event 6: fire-and-forget VERITAS governance-exception
// emit at guard-violation sites. Default transport is noop (zero behaviour
// change); emit errors are swallowed and the original throw path is untouched.
const { emitGovernanceException } = require('../event_bus/veritas/guards');

const MAPPING = JSON.parse(
  fs.readFileSync(
    path.join(__dirname, '../../config/contracts/qiwa_field_mapping_v1.json'),
    'utf8'
  )
);

const FIELD_MAP      = MAPPING.fieldMap;
const REQUIRED_FIELDS = MAPPING.requiredFields;
const TRANSITIONS    = MAPPING.stateTransitions;
const HUMAN_REQUIRED = new Set(MAPPING.humanApprovalRequired);
const TERMINAL_STATES = new Set(MAPPING.terminalStates);
const GUARDS         = MAPPING.transitionGuards;

// ── helpers ───────────────────────────────────────────────────────────────────

function transitionError(message) {
  const err = new Error(message);
  err.name = 'ContractTransitionError';
  return err;
}

function serviceError(message) {
  const err = new Error(message);
  err.name = 'ContractStateMachineError';
  return err;
}

function assert(condition, message) {
  if (!condition) throw serviceError(message);
}

function clone(v) { return JSON.parse(JSON.stringify(v)); }

function nowIso() { return new Date().toISOString(); }

// ── Qiwa field mapping ────────────────────────────────────────────────────────

/**
 * generateQiwaPayload — maps ProWork contract fields → Qiwa field names.
 * Returns a ready-for-API-integration payload object.
 */
function generateQiwaPayload(contract) {
  const payload = {};
  for (const [proworkField, qiwaField] of Object.entries(FIELD_MAP)) {
    const value = contract[proworkField];
    if (value !== undefined && value !== null) {
      payload[qiwaField] = value;
    }
  }
  return {
    _qiwa_mapping_version: MAPPING.version,
    _generated_at:         nowIso(),
    ...payload,
  };
}

/**
 * validateQiwaCompleteness — checks all required Qiwa fields are present.
 */
function validateQiwaCompleteness(contract) {
  const missingFields = REQUIRED_FIELDS.filter(f => {
    const v = contract[f];
    return v === undefined || v === null || v === '';
  });

  return {
    complete:      missingFields.length === 0,
    missingFields,
    totalRequired: REQUIRED_FIELDS.length,
    presentCount:  REQUIRED_FIELDS.length - missingFields.length,
  };
}

// ── In-memory stores ──────────────────────────────────────────────────────────

class InMemoryContractStore {
  constructor() { this._contracts = new Map(); }

  async insert(c) {
    assert(!this._contracts.has(c.contract_id), `contract already exists: ${c.contract_id}`);
    this._contracts.set(c.contract_id, clone(c));
    return clone(c);
  }

  async update(contractId, patch) {
    const existing = this._contracts.get(contractId);
    assert(existing, `contract not found: ${contractId}`);
    const next = clone({ ...existing, ...patch });
    this._contracts.set(contractId, next);
    return clone(next);
  }

  async get(contractId) {
    return this._contracts.has(contractId) ? clone(this._contracts.get(contractId)) : null;
  }
}

/** Append-only — no update/delete methods exposed */
class InMemoryContractEventStore {
  constructor() { this._events = new Map(); /* contractId → ordered array */ }

  async append(event) {
    assert(event.event_id,    'event.event_id is required');
    assert(event.contract_id, 'event.contract_id is required');
    if (!this._events.has(event.contract_id)) {
      this._events.set(event.contract_id, []);
    }
    const frozen = Object.freeze(clone(event));
    this._events.get(event.contract_id).push(frozen);
    return clone(frozen);
  }

  async getByContract(contractId) {
    return (this._events.get(contractId) || []).map(clone);
  }

  async allEvents() {
    const all = [];
    for (const arr of this._events.values()) all.push(...arr);
    return all.map(clone);
  }
}

// ── Guard validators ──────────────────────────────────────────────────────────

/**
 * assertBothPartySignatures — DL-VER-BPS-001 governed completion authority.
 * This is the SINGLE source of the bilateral-signature completion gate.
 * app/modules/contracts/contract_service.js imports this so its SIGNED
 * transition is subordinated to the same guard (no alternate authority path).
 */
function assertBothPartySignatures(input, fromState, toState) {
  if (!input || !input.both_party_signatures) {
    throw transitionError(
      `${fromState}→${toState} requires both_party_signatures: true`
    );
  }
}

function runGuards(guardNames, fromState, toState, contract, input) {
  for (const guard of (guardNames || [])) {
    switch (guard) {
      case 'qiwa_completeness': {
        // Ordinary completeness validation — NOT a governance-exception (event 6)
        // emit site per the guards.js scoping rule (business-rule rejection).
        const result = validateQiwaCompleteness(contract);
        if (!result.complete) {
          throw transitionError(
            `${fromState}→${toState} blocked: Qiwa completeness check failed. ` +
            `Missing fields: ${result.missingFields.join(', ')}`
          );
        }
        break;
      }
      case 'human_actor': {
        if (!input.actor || input.actor.actor_type !== 'HUMAN') {
          // event 6 — execution-boundary violation (agent/non-human actor).
          emitGovernanceException({
            kind:          'execution_boundary',
            guard:         'human_actor',
            fromState, toState,
            contractId:    contract.contract_id,
            tenantId:      contract.tenant_id,
            actor:         input.actor,
            correlationId: input.correlation_id,
            causationId:   input.causation_id,
          });
          throw transitionError(
            `${fromState}→${toState} requires HUMAN actor — auto-transitions are not permitted`
          );
        }
        break;
      }
      case 'both_party_signatures': {
        if (!input.both_party_signatures) {
          // event 6 — policy violation (incomplete bilateral execution).
          emitGovernanceException({
            kind:          'policy',
            guard:         'both_party_signatures',
            fromState, toState,
            contractId:    contract.contract_id,
            tenantId:      contract.tenant_id,
            actor:         input.actor,
            correlationId: input.correlation_id,
            causationId:   input.causation_id,
          });
        }
        assertBothPartySignatures(input, fromState, toState);
        break;
      }
      case 'activation_date': {
        if (!input.activation_date) {
          throw transitionError(
            `${fromState}→${toState} requires activation_date`
          );
        }
        break;
      }
      case 'amendment_reason': {
        if (!input.amendment_reason) {
          throw transitionError(
            `${fromState}→${toState} requires amendment_reason`
          );
        }
        break;
      }
      case 'amended_fields': {
        if (!input.amended_fields || typeof input.amended_fields !== 'object') {
          throw transitionError(
            `${fromState}→${toState} requires amended_fields object`
          );
        }
        break;
      }
      case 'termination_code': {
        if (!input.termination_code) {
          throw transitionError(
            `${fromState}→${toState} requires termination_code`
          );
        }
        break;
      }
      case 'notice_details': {
        if (!input.notice_details || typeof input.notice_details !== 'object') {
          throw transitionError(
            `${fromState}→${toState} requires notice_details object`
          );
        }
        break;
      }
    }
  }
}

// ── Service factory ───────────────────────────────────────────────────────────

function createContractStateMachine({ contractStore, eventStore, hooks }) {
  assert(contractStore, 'contractStore is required');
  assert(eventStore,    'eventStore is required');
  assert(hooks && typeof hooks.publish === 'function', 'hooks.publish is required');

  /** Create a new contract in DRAFT state. */
  async function draftContract(input) {
    assert(input.contract_id,        'contract_id is required');
    assert(input.worker_id,          'worker_id is required');
    assert(input.tenant_id,          'tenant_id is required');
    assert(input.onboarding_case_id, 'onboarding_case_id is required');

    const contract = {
      contract_id:              input.contract_id,
      tenant_id:                input.tenant_id,
      worker_id:                input.worker_id,
      onboarding_case_id:       input.onboarding_case_id,
      role_title:               input.role_title               || null,
      wage_base:                input.wage_base                ?? null,
      housing_allowance:        input.housing_allowance        ?? null,
      transport_allowance:      input.transport_allowance      ?? null,
      other_allowances:         input.other_allowances         ?? null,
      probation_days:           input.probation_days           ?? 90,
      notice_days:              input.notice_days              ?? 30,
      contract_duration_months: input.contract_duration_months ?? null,
      work_location:            input.work_location            || null,
      worker_national_id:       input.worker_national_id       || null,
      employer_cr_number:       input.employer_cr_number       || null,
      contract_start_date:      input.contract_start_date      || null,
      contract_end_date:        input.contract_end_date        || null,
      working_hours_per_week:   input.working_hours_per_week   ?? null,
      occupation_code:          input.occupation_code          || null,
      nationality:              input.nationality              || null,
      status:                   'DRAFT',
      created_at:               input.occurred_at || nowIso(),
      updated_at:               input.occurred_at || nowIso(),
    };

    await contractStore.insert(contract);

    const eventId = input.event_id || crypto.randomUUID();
    await eventStore.append({
      event_id:               eventId,
      contract_id:            contract.contract_id,
      from_state:             null,
      to_state:               'DRAFT',
      actor:                  input.actor,
      reason:                 'contract_created',
      evidence:               {},
      occurred_at:            input.occurred_at || nowIso(),
      tenant_id:              input.tenant_id,
      qiwa_payload_snapshot:  generateQiwaPayload(contract),
    });

    await hooks.publish({
      event_id:       eventId,
      event_type:     'CONTRACT_DRAFTED',
      event_version:  '1.0',
      occurred_at:    input.occurred_at || nowIso(),
      tenant_id:      input.tenant_id,
      aggregate_type: 'ONBOARDING_CASE',
      aggregate_id:   input.onboarding_case_id,
      actor:          input.actor,
      correlation_id: input.correlation_id,
      causation_id:   input.causation_id,
      source: { service: 'onboarding', module: 'contract_state_machine', environment: process.env.NODE_ENV || 'development' },
      trust_level: 'STANDARD', requires_approval: false,
      payload: { contract_id: contract.contract_id, worker_id: contract.worker_id, status: 'DRAFT' },
      metadata: input.metadata || {},
    });

    return contract;
  }

  /**
   * transition — applies a state transition to the contract.
   * Validates: state machine graph + guards + human approval gate.
   * Logs immutable lifecycle event on every successful transition.
   */
  async function transition(input) {
    assert(input.contract_id, 'contract_id is required');
    assert(input.to_state,    'to_state is required');
    assert(input.actor,       'actor is required');

    const contract = await contractStore.get(input.contract_id);
    assert(contract, `contract not found: ${input.contract_id}`);

    const fromState = contract.status;
    const toState   = input.to_state;

    // ── 1. Terminal state check ──────────────────────────────────────────────
    if (TERMINAL_STATES.has(fromState)) {
      // event 6 — policy violation (transition out of a terminal state).
      emitGovernanceException({
        kind:          'policy',
        guard:         'terminal_state',
        fromState, toState,
        contractId:    contract.contract_id,
        tenantId:      contract.tenant_id,
        actor:         input.actor,
        correlationId: input.correlation_id,
        causationId:   input.causation_id,
      });
      throw transitionError(
        `${fromState} is a terminal state — no further transitions are permitted`
      );
    }

    // ── 2. Valid transition check ────────────────────────────────────────────
    const allowed = TRANSITIONS[fromState] || [];
    if (!allowed.includes(toState)) {
      // event 6 — policy violation (illegal state-machine edge).
      emitGovernanceException({
        kind:          'policy',
        guard:         'invalid_transition',
        fromState, toState,
        contractId:    contract.contract_id,
        tenantId:      contract.tenant_id,
        actor:         input.actor,
        correlationId: input.correlation_id,
        causationId:   input.causation_id,
      });
      throw transitionError(
        `Invalid transition: ${fromState} → ${toState}. ` +
        `Allowed from ${fromState}: [${allowed.join(', ') || 'none'}]`
      );
    }

    // ── 3. Guard evaluation ──────────────────────────────────────────────────
    const guardKey  = `${fromState}_to_${toState}`;
    const guardList = GUARDS[guardKey] || [];
    runGuards(guardList, fromState, toState, contract, input);

    // ── 4. Build contract patch ──────────────────────────────────────────────
    const patch = { status: toState, updated_at: input.occurred_at || nowIso() };

    if (toState === 'ACTIVATED')  patch.activation_date   = input.activation_date;
    if (toState === 'AMENDED') {
      patch.amendment_reason  = input.amendment_reason;
      patch.amended_fields    = input.amended_fields;
      // Apply amended field values to contract
      Object.assign(patch, input.amended_fields);
    }
    if (toState === 'TERMINATED') {
      patch.termination_code  = input.termination_code;
      patch.notice_details    = input.notice_details;
      patch.terminated_at     = input.occurred_at || nowIso();
    }

    const updated = await contractStore.update(input.contract_id, patch);

    // ── 5. Append immutable lifecycle event ──────────────────────────────────
    const eventId = input.event_id || crypto.randomUUID();
    const qiwaSnap = generateQiwaPayload(updated);

    await eventStore.append({
      event_id:               eventId,
      contract_id:            input.contract_id,
      from_state:             fromState,
      to_state:               toState,
      actor:                  input.actor,
      reason:                 input.reason || null,
      evidence:               input.evidence || {},
      occurred_at:            input.occurred_at || nowIso(),
      tenant_id:              contract.tenant_id,
      qiwa_payload_snapshot:  qiwaSnap,
    });

    // ── 6. Publish domain event ───────────────────────────────────────────────
    const eventTypeMap = {
      REVIEW:     'CONTRACT_SENT_FOR_REVIEW',
      DRAFT:      'CONTRACT_RETURNED_TO_DRAFT',
      SIGNED:     'CONTRACT_SIGNED',
      ACTIVATED:  'CONTRACT_ACTIVATED',
      AMENDED:    'CONTRACT_AMENDED',
      TERMINATED: 'CONTRACT_TERMINATED',
    };

    await hooks.publish({
      event_id:       eventId,
      event_type:     eventTypeMap[toState] || `CONTRACT_TRANSITIONED_TO_${toState}`,
      event_version:  '1.0',
      occurred_at:    input.occurred_at || nowIso(),
      tenant_id:      contract.tenant_id,
      aggregate_type: 'ONBOARDING_CASE',
      aggregate_id:   updated.onboarding_case_id,
      actor:          input.actor,
      correlation_id: input.correlation_id,
      causation_id:   input.causation_id,
      source: { service: 'onboarding', module: 'contract_state_machine', environment: process.env.NODE_ENV || 'development' },
      trust_level:       HUMAN_REQUIRED.has(toState) ? 'HIGH' : 'STANDARD',
      requires_approval: HUMAN_REQUIRED.has(toState),
      payload: { contract_id: updated.contract_id, from_state: fromState, to_state: toState },
      metadata: input.metadata || {},
    });

    return updated;
  }

  async function getContract(contractId) {
    assert(contractId, 'contractId is required');
    return contractStore.get(contractId);
  }

  async function getLifecycleEvents(contractId) {
    assert(contractId, 'contractId is required');
    return eventStore.getByContract(contractId);
  }

  return {
    draftContract,
    transition,
    getContract,
    getLifecycleEvents,
    // Expose for direct use
    generateQiwaPayload,
    validateQiwaCompleteness,
    MAPPING,
  };
}

module.exports = {
  createContractStateMachine,
  InMemoryContractStore,
  InMemoryContractEventStore,
  generateQiwaPayload,
  validateQiwaCompleteness,
  assertBothPartySignatures,
  MAPPING,
};
