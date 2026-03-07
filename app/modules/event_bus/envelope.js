'use strict';

const ALLOWED_ACTOR_TYPES = new Set(['HUMAN', 'AGENT', 'SYSTEM']);
const ALLOWED_TRUST_LEVELS = new Set(['LOW', 'STANDARD', 'HIGH', 'CRITICAL']);

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function assert(condition, message) {
  if (!condition) {
    const err = new Error(message);
    err.name = 'EventEnvelopeValidationError';
    throw err;
  }
}

function validateActor(actor) {
  assert(isObject(actor), 'actor must be an object');
  assert(isNonEmptyString(actor.actor_type), 'actor.actor_type is required');
  assert(ALLOWED_ACTOR_TYPES.has(actor.actor_type), 'actor.actor_type is invalid');
  assert(isNonEmptyString(actor.actor_id), 'actor.actor_id is required');
}

function validateSource(source) {
  assert(isObject(source), 'source must be an object');
  assert(isNonEmptyString(source.service), 'source.service is required');
  assert(isNonEmptyString(source.module), 'source.module is required');
  assert(isNonEmptyString(source.environment), 'source.environment is required');
}

function validateEnvelope(event) {
  assert(isObject(event), 'event must be an object');
  assert(isNonEmptyString(event.event_id), 'event_id is required');
  assert(isNonEmptyString(event.event_type), 'event_type is required');
  assert(/^[A-Z0-9_]+$/.test(event.event_type), 'event_type must be uppercase underscore format');
  assert(isNonEmptyString(event.event_version), 'event_version is required');
  assert(isNonEmptyString(event.occurred_at), 'occurred_at is required');
  assert(!Number.isNaN(Date.parse(event.occurred_at)), 'occurred_at must be a valid timestamp');
  assert(isNonEmptyString(event.tenant_id), 'tenant_id is required');
  assert(isNonEmptyString(event.aggregate_type), 'aggregate_type is required');
  assert(isNonEmptyString(event.aggregate_id), 'aggregate_id is required');
  validateActor(event.actor);
  assert(isNonEmptyString(event.correlation_id), 'correlation_id is required');
  assert(isNonEmptyString(event.causation_id), 'causation_id is required');
  validateSource(event.source);
  assert(isNonEmptyString(event.trust_level), 'trust_level is required');
  assert(ALLOWED_TRUST_LEVELS.has(event.trust_level), 'trust_level is invalid');
  assert(typeof event.requires_approval === 'boolean', 'requires_approval must be boolean');
  assert(isObject(event.payload), 'payload must be an object');
  assert(isObject(event.metadata), 'metadata must be an object');
  return true;
}

function canonicalize(value) {
  if (Array.isArray(value)) {
    return value.map(canonicalize);
  }
  if (isObject(value)) {
    const out = {};
    for (const key of Object.keys(value).sort()) {
      out[key] = canonicalize(value[key]);
    }
    return out;
  }
  return value;
}

function normalizeEnvelope(event) {
  validateEnvelope(event);
  return canonicalize(event);
}

module.exports = {
  validateEnvelope,
  normalizeEnvelope,
  ALLOWED_ACTOR_TYPES: Array.from(ALLOWED_ACTOR_TYPES),
  ALLOWED_TRUST_LEVELS: Array.from(ALLOWED_TRUST_LEVELS),
};
