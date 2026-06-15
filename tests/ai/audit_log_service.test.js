'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');

const {
  createAuditLogService,
  InMemoryAuditLogStore,
  computeImmutableHash,
  ACTION_TYPES,
  AuditLogServiceError,
  ImmutableHashError,
} = require('../../app/modules/ai/audit_log_service');

const { computeBiasScore } = require('../../app/modules/ai/bias_monitor');

// ─── Fixtures ────────────────────────────────────────────────────────────────

const TENANT_A = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const TENANT_B = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const ACTOR_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc';

function makeBase(overrides = {}) {
  return {
    tenant_id:       TENANT_A,
    actor:           ACTOR_ID,
    action_type:     'RECOMMENDATION',
    input_signals:   { skills_match: 0.87, prior_delivery: 12 },
    rationale:       'Top match on skills and delivery record',
    confidence_score: 0.87,
    model_version:   'prowork-ai-v1.0',
    output_snapshot: { recommended_candidate_id: 'cand-001', rank: 1 },
    ...overrides,
  };
}

function makeService() {
  const store = new InMemoryAuditLogStore();
  const service = createAuditLogService({ store });
  return { store, service };
}

// ─── Test 1: write() creates entry with immutable_hash ───────────────────────

describe('write()', () => {
  test('creates an entry and sets immutable_hash', async () => {
    const { service } = makeService();
    const entry = await service.write(makeBase());

    assert.ok(entry.id, 'entry has id');
    assert.ok(entry.immutable_hash, 'entry has immutable_hash');
    assert.equal(entry.reviewer_decision, 'PENDING');
    assert.equal(entry.tenant_id, TENANT_A);
  });

  // ─── Test 2: immutable_hash is correct SHA-256 ───────────────────────────

  test('immutable_hash matches computed hash of all fields except itself', async () => {
    const { service } = makeService();
    const entry = await service.write(makeBase());

    const expected = computeImmutableHash(entry);
    assert.equal(entry.immutable_hash, expected);
  });

  // ─── Test 3: reviewer_decision defaults to PENDING ───────────────────────

  test('reviewer_decision defaults to PENDING on write', async () => {
    const { service } = makeService();
    const entry = await service.write(makeBase());
    assert.equal(entry.reviewer_decision, 'PENDING');
    assert.equal(entry.reviewer_id, null);
    assert.equal(entry.reviewed_at, null);
  });

  // ─── Test 4: all ACTION_TYPES are accepted ────────────────────────────────

  test('accepts all valid action_types', async () => {
    const { service } = makeService();
    for (const action_type of ACTION_TYPES) {
      const entry = await service.write(makeBase({ action_type }));
      assert.equal(entry.action_type, action_type);
    }
  });

  // ─── Test 5: invalid action_type throws ──────────────────────────────────

  test('throws on invalid action_type', async () => {
    const { service } = makeService();
    await assert.rejects(
      () => service.write(makeBase({ action_type: 'INVALID_TYPE' })),
      AuditLogServiceError
    );
  });

  // ─── Test 6: confidence_score out of range throws ────────────────────────

  test('throws if confidence_score is out of [0,1] range', async () => {
    const { service } = makeService();
    await assert.rejects(
      () => service.write(makeBase({ confidence_score: 1.5 })),
      AuditLogServiceError
    );
    await assert.rejects(
      () => service.write(makeBase({ confidence_score: -0.1 })),
      AuditLogServiceError
    );
  });

  // ─── Test 7: bias score is logged and does not block ─────────────────────

  test('logs bias_score and never blocks when sensitive signals are present', async () => {
    const { service } = makeService();
    const entry = await service.write(makeBase({
      input_signals: { skills_match: 0.9, nationality: 'SA', age: 28 },
    }));

    // Entry is created — bias did not block
    assert.ok(entry.id, 'entry created despite sensitive signals');
    assert.ok(typeof entry.bias_score === 'number', 'bias_score is a number');
    assert.ok(entry.bias_score > 0, 'bias_score is nonzero when sensitive signals present');
    assert.ok(Array.isArray(entry.bias_sensitive_signals), 'bias_sensitive_signals recorded');
    assert.ok(entry.bias_sensitive_signals.includes('nationality'), 'nationality flagged');
    assert.ok(entry.bias_sensitive_signals.includes('age'), 'age flagged');
  });

  // ─── Test 8: missing tenant_id throws ────────────────────────────────────

  test('throws when tenant_id is missing', async () => {
    const { service } = makeService();
    await assert.rejects(
      () => service.write(makeBase({ tenant_id: null })),
      AuditLogServiceError
    );
  });
});

// ─── Test 9: get() verifies immutable hash on read ───────────────────────────

describe('get()', () => {
  test('verifies immutable hash on every read', async () => {
    const { service, store } = makeService();
    const entry = await service.write(makeBase());

    // Normal read succeeds
    const fetched = await service.get(entry.id, TENANT_A);
    assert.equal(fetched.id, entry.id);
  });

  test('throws ImmutableHashError if hash has been tampered', async () => {
    const { service, store } = makeService();
    const entry = await service.write(makeBase());

    // Manually corrupt the stored entry's hash
    const stored = store._entries.get(entry.id);
    // Unfreeze for tamper simulation
    const tampered = { ...stored, immutable_hash: 'deadbeef' };
    store._entries.set(entry.id, Object.freeze(tampered));

    await assert.rejects(
      () => service.get(entry.id, TENANT_A),
      ImmutableHashError
    );
  });

  // ─── Test 10: tenant isolation enforced on get() ─────────────────────────

  test('enforces tenant isolation — wrong tenant cannot read entry', async () => {
    const { service } = makeService();
    const entry = await service.write(makeBase({ tenant_id: TENANT_A }));

    await assert.rejects(
      () => service.get(entry.id, TENANT_B),
      AuditLogServiceError
    );
  });
});

// ─── Test 11: query() returns only entries for the requesting tenant ──────────

describe('query()', () => {
  test('returns only entries belonging to the requesting tenant', async () => {
    const { service } = makeService();

    await service.write(makeBase({ tenant_id: TENANT_A }));
    await service.write(makeBase({ tenant_id: TENANT_A }));
    await service.write(makeBase({ tenant_id: TENANT_B }));

    const resultsA = await service.query(TENANT_A);
    const resultsB = await service.query(TENANT_B);

    assert.equal(resultsA.length, 2);
    assert.equal(resultsB.length, 1);
    assert.ok(resultsA.every((e) => e.tenant_id === TENANT_A));
  });

  test('filters by reviewerDecision when provided', async () => {
    const { service } = makeService();
    await service.write(makeBase({ tenant_id: TENANT_A }));
    await service.write(makeBase({ tenant_id: TENANT_A }));

    const pending = await service.query(TENANT_A, { reviewerDecision: 'PENDING' });
    assert.equal(pending.length, 2);

    const accepted = await service.query(TENANT_A, { reviewerDecision: 'ACCEPTED' });
    assert.equal(accepted.length, 0);
  });
});

// ─── Test 12: exportForRegulator() returns structured JSON ───────────────────

describe('exportForRegulator()', () => {
  test('returns structured export with correct shape and entry count', async () => {
    const { service } = makeService();

    await service.write(makeBase({ tenant_id: TENANT_A }));
    await service.write(makeBase({ tenant_id: TENANT_A }));
    await service.write(makeBase({ tenant_id: TENANT_B }));

    const exported = await service.exportForRegulator(TENANT_A);

    assert.equal(exported.export_version, '1.0');
    assert.ok(exported.exported_at, 'exported_at is set');
    assert.equal(exported.tenant_id, TENANT_A);
    assert.equal(exported.total_entries, 2);
    assert.equal(exported.entries.length, 2);
    assert.ok(exported.entries.every((e) => e.tenant_id === TENANT_A));
  });
});

// ─── Test 13: bias monitor standalone — computeBiasScore ─────────────────────

describe('computeBiasScore()', () => {
  test('returns zero score and no flags for neutral signals', () => {
    const result = computeBiasScore({ skills_match: 0.9, delivery_rate: 0.85 });
    assert.equal(result.biasScore, 0.00);
    assert.equal(result.flagged, false);
    assert.deepEqual(result.sensitiveSignals, []);
  });

  test('detects nationality as a sensitive signal', () => {
    const result = computeBiasScore({ nationality: 'SA', skills_match: 0.8 });
    assert.ok(result.flagged);
    assert.ok(result.sensitiveSignals.includes('nationality'));
    assert.ok(result.biasScore > 0);
  });

  test('detects gender as a sensitive signal', () => {
    const result = computeBiasScore({ gender: 'M', skills_match: 0.7 });
    assert.ok(result.flagged);
    assert.ok(result.sensitiveSignals.includes('gender'));
  });

  test('detects age as a sensitive signal', () => {
    const result = computeBiasScore({ age: 35 });
    assert.ok(result.flagged);
    assert.ok(result.sensitiveSignals.includes('age'));
  });

  test('bias score is clamped to 1.00 maximum', () => {
    const result = computeBiasScore({
      nationality: { weight: 0.6 },
      gender:      { weight: 0.6 },
      age:         { weight: 0.6 },
    });
    assert.ok(result.biasScore <= 1.00);
  });

  test('handles null/empty signals gracefully', () => {
    assert.doesNotThrow(() => computeBiasScore(null));
    assert.doesNotThrow(() => computeBiasScore({}));
    assert.doesNotThrow(() => computeBiasScore(undefined));

    const r = computeBiasScore(null);
    assert.equal(r.biasScore, 0.00);
    assert.equal(r.flagged, false);
  });
});
