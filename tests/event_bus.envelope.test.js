'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { validateEnvelope, normalizeEnvelope, ALLOWED_ACTOR_TYPES, ALLOWED_TRUST_LEVELS } = require('../app/modules/event_bus/envelope');

function validEnvelope(overrides = {}) {
  return {
    event_id: '11111111-1111-1111-1111-111111111111',
    event_type: 'PROJECT_CREATED',
    event_version: '1.0',
    occurred_at: '2026-03-06T12:00:00Z',
    tenant_id: '22222222-2222-2222-2222-222222222222',
    aggregate_type: 'PROJECT',
    aggregate_id: '33333333-3333-3333-3333-333333333333',
    actor: {
      actor_type: 'HUMAN',
      actor_id: '44444444-4444-4444-4444-444444444444',
    },
    correlation_id: '55555555-5555-5555-5555-555555555555',
    causation_id: '66666666-6666-6666-6666-666666666666',
    source: {
      service: 'execution_engine',
      module: 'projects',
      environment: 'test',
    },
    trust_level: 'STANDARD',
    requires_approval: false,
    payload: { project_id: 'p1', owner_user_id: 'u1', title: 'T', status: 'DISCUSSION' },
    metadata: {},
    ...overrides,
  };
}

test('validateEnvelope accepts a valid canonical envelope', () => {
  assert.equal(validateEnvelope(validEnvelope()), true);
});

test('validateEnvelope accepts all valid actor_types', () => {
  for (const actor_type of ALLOWED_ACTOR_TYPES) {
    assert.equal(validateEnvelope(validEnvelope({ actor: { actor_type, actor_id: 'x' } })), true);
  }
});

test('validateEnvelope accepts all valid trust_levels', () => {
  for (const trust_level of ALLOWED_TRUST_LEVELS) {
    assert.equal(validateEnvelope(validEnvelope({ trust_level })), true);
  }
});

test('validateEnvelope rejects invalid event_type casing', () => {
  assert.throws(
    () => validateEnvelope(validEnvelope({ event_type: 'project-created' })),
    /event_type must be uppercase underscore format/
  );
});

test('validateEnvelope rejects invalid actor_type', () => {
  assert.throws(
    () => validateEnvelope(validEnvelope({ actor: { actor_type: 'BOT', actor_id: 'x' } })),
    /actor\.actor_type is invalid/
  );
});

test('validateEnvelope rejects invalid trust_level', () => {
  assert.throws(
    () => validateEnvelope(validEnvelope({ trust_level: 'ULTRA' })),
    /trust_level is invalid/
  );
});

test('validateEnvelope rejects non-boolean requires_approval', () => {
  assert.throws(
    () => validateEnvelope(validEnvelope({ requires_approval: 1 })),
    /requires_approval must be boolean/
  );
});

test('validateEnvelope rejects malformed occurred_at', () => {
  assert.throws(
    () => validateEnvelope(validEnvelope({ occurred_at: 'not-a-date' })),
    /occurred_at must be a valid timestamp/
  );
});

test('normalizeEnvelope returns deterministically sorted keys', () => {
  const e1 = validEnvelope({ metadata: { z: 1, a: 2 }, payload: { status: 'X', project_id: 'p', owner_user_id: 'u', title: 'T' } });
  const e2 = validEnvelope({ metadata: { a: 2, z: 1 }, payload: { project_id: 'p', owner_user_id: 'u', title: 'T', status: 'X' } });
  assert.deepEqual(normalizeEnvelope(e1), normalizeEnvelope(e2));
});
