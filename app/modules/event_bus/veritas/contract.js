'use strict';

// VERITAS eight-attribute contract adapter for WorkCaptain (Mode-D).
// Authority: WORKCAPTAIN_INTEGRATION_BRIEF Sponsor Ruling (31 May 2026).
// Source of truth: ./schema.json (vendored verbatim from VERITAS MVP).

const crypto = require('crypto');
const SCHEMA = require('./schema.json');

const SOURCE_PLATFORM = 'prowork';

// WHITELIST: the EXACT approved set of internal event types the forwarder ships
// to VERITAS. Sponsor Ruling: "Assert the forwarder whitelist is EXACTLY the
// approved set — fail on silent additions (leak risk) as well as removals."
// Mutation of this constant is gated by scripts/veritas_whitelist_check.js.
const WHITELIST = Object.freeze({
  ONBOARDING_STARTED: {
    wc_event:     'WORKCAPTAIN_ONBOARDING_STARTED',
    event_class:  'workflow_execution',
    outcome:      'delivered',
  },
  CANDIDATE_MATCHED: {
    wc_event:     'WORKCAPTAIN_SCORE_GENERATED',
    event_class:  'agent_decision',
    outcome:      'delivered',
  },
  CANDIDATE_SHORTLISTED: {
    wc_event:     'WORKCAPTAIN_SCORE_REVIEWED',
    event_class:  'agent_decision',
    outcome:      'delivered',
  },
});

function classifySeverity(ev) {
  if (ev.outcome === 'classification_breach_prevented' || ev.outcome === 'sla_fail_closed') return 'Critical';
  if (ev.consent_state === 'fail_closed') return 'Critical';
  if (ev.event_class === 'divergence_detection') return 'High';
  if (ev.outcome === 'blocked') return 'High';
  if (ev.event_class === 'configuration' || ev.event_class === 'consent_state_transition') return 'Medium';
  return 'Low';
}

function buildVeritasEvent({
  eventId,
  eventTimestamp,
  eventClass,
  outcome,
  mode = 'D',
  classification = 'Internal',
  consentState = 'not_applicable',
  fieldSet = null,
  payload = null,
  provenanceExtras = null,
}) {
  const provenance = Object.assign(
    { mode_d_tagged: mode === 'D' },
    provenanceExtras || {}
  );
  const ev = {
    event_id:             eventId,
    event_timestamp:      eventTimestamp,
    source_platform:      SOURCE_PLATFORM,
    destination_platform: null,
    counterparty_ref:     null,
    classification,
    consent_state:        consentState,
    field_set:            fieldSet,
    outcome,
    event_class:          eventClass,
    mode,
    severity:             null,
    provenance,
    payload,
  };
  ev.severity = classifySeverity(ev);
  return ev;
}

// Transform an internal (event-bus envelope) event into the VERITAS contract.
// Returns null if the internal event_type is not on the whitelist.
function mapInternalToVeritas(internalEvent) {
  const rule = WHITELIST[internalEvent.event_type];
  if (!rule) return null;
  const innerPayload = internalEvent.payload || {};
  const fieldSet = {
    schema_ref: `prowork.${internalEvent.event_type}.v${internalEvent.event_version || '1.0'}`,
    fields:     Object.keys(innerPayload).sort(),
  };
  const provenanceExtras = {
    source_event_type: internalEvent.event_type,
    source_event_id:   internalEvent.event_id,
    actor_type:        internalEvent.actor && internalEvent.actor.actor_type ? internalEvent.actor.actor_type : null,
    environment:       internalEvent.source && internalEvent.source.environment ? internalEvent.source.environment : null,
  };
  return buildVeritasEvent({
    eventId:        internalEvent.event_id,
    eventTimestamp: internalEvent.occurred_at,
    eventClass:     rule.event_class,
    outcome:        rule.outcome,
    fieldSet,
    payload: {
      wc_event:            rule.wc_event,
      internal_event_type: internalEvent.event_type,
      body:                innerPayload,
    },
    provenanceExtras,
  });
}

// Build a Mode-D governance-exception event for the event-6 fire-and-forget
// path. Used by ../guards.js. The internal event bus is NOT involved here —
// this is a direct emit from a guard violation site.
function buildGovernanceExceptionEvent({
  kind,           // 'execution_boundary' | 'policy'
  guard,          // 'human_actor' | 'terminal_state' | 'invalid_transition'
  fromState,
  toState,
  contractId,
  tenantId,
  actor,
  correlationId,
  causationId,
}) {
  return buildVeritasEvent({
    eventId:        crypto.randomUUID(),
    eventTimestamp: new Date().toISOString(),
    eventClass:     'divergence_detection',
    outcome:        'blocked',
    fieldSet: {
      schema_ref: `prowork.contract_state_machine.guard_violation.v1`,
      fields:     ['kind', 'guard', 'from_state', 'to_state', 'contract_id', 'tenant_id'],
    },
    payload: {
      wc_event:       'WORKCAPTAIN_GOVERNANCE_EXCEPTION',
      kind,
      guard,
      from_state:     fromState,
      to_state:       toState,
      contract_id:    contractId,
      tenant_id:      tenantId,
    },
    provenanceExtras: {
      actor_type:      actor && actor.actor_type ? actor.actor_type : null,
      correlation_id:  correlationId || null,
      causation_id:    causationId || null,
      source_module:   'contract_state_machine',
    },
  });
}

module.exports = {
  SOURCE_PLATFORM,
  SCHEMA,
  WHITELIST,
  classifySeverity,
  buildVeritasEvent,
  mapInternalToVeritas,
  buildGovernanceExceptionEvent,
};
