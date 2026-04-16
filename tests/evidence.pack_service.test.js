'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');

const {
  createEvidencePackService,
  InMemoryEvidencePackStore,
  computeImmutableHash,
  verifyHash,
  validateRequiredFields,
} = require('../app/modules/evidence/evidence_pack_service');

const { applyRedactionRules } = require('../app/modules/evidence/redaction_service');

// ── helpers ───────────────────────────────────────────────────────────────────

function makeStore() {
  return new InMemoryEvidencePackStore();
}

function makeSvc(store) {
  return createEvidencePackService({ store: store || makeStore() });
}

function baseParams(overrides = {}) {
  return {
    pack_id:         'pack-001',
    pack_type:       'EP_WOS_HIRE_01',
    tenant_id:       'tenant-abc',
    actor:           { actor_id: 'usr-1', actor_name: 'Alice', actor_role: 'HR' },
    action:          'Contract signed for worker wrk-1',
    timestamp:       '2026-04-16T10:00:00.000Z',
    data_snapshot:   { contract_id: 'ctr-1', status: 'SIGNED' },
    attached_files:  [],
    approval_chain:  [],
    ai_artifacts:    [],
    redaction_rules: [],
    ...overrides,
  };
}

// ── 1. computeImmutableHash ───────────────────────────────────────────────────

describe('computeImmutableHash', () => {
  test('produces a 64-char hex string', () => {
    const hash = computeImmutableHash(baseParams());
    assert.match(hash, /^[a-f0-9]{64}$/);
  });

  test('same inputs produce same hash (deterministic)', () => {
    const p = baseParams();
    assert.equal(computeImmutableHash(p), computeImmutableHash(p));
  });

  test('different data_snapshot produces different hash', () => {
    const h1 = computeImmutableHash(baseParams({ data_snapshot: { x: 1 } }));
    const h2 = computeImmutableHash(baseParams({ data_snapshot: { x: 2 } }));
    assert.notEqual(h1, h2);
  });

  test('changing tenant_id changes hash', () => {
    const h1 = computeImmutableHash(baseParams({ tenant_id: 'tenant-A' }));
    const h2 = computeImmutableHash(baseParams({ tenant_id: 'tenant-B' }));
    assert.notEqual(h1, h2);
  });

  test('non-hash fields (attached_files) do not affect hash', () => {
    const h1 = computeImmutableHash(baseParams({ attached_files: [] }));
    const h2 = computeImmutableHash(baseParams({ attached_files: [{ file_id: 'f1', file_name: 'a.pdf', uploaded_by: 'HR' }] }));
    assert.equal(h1, h2);
  });
});

// ── 2. validateRequiredFields ─────────────────────────────────────────────────

describe('validateRequiredFields', () => {
  test('passes with all 8 fields present', () => {
    assert.doesNotThrow(() => validateRequiredFields(baseParams()));
  });

  test('throws when actor is missing', () => {
    assert.throws(() => validateRequiredFields(baseParams({ actor: null })));
  });

  test('throws when action is empty string', () => {
    assert.throws(() => validateRequiredFields(baseParams({ action: '   ' })));
  });

  test('throws when data_snapshot is null', () => {
    assert.throws(() => validateRequiredFields(baseParams({ data_snapshot: null })));
  });

  test('throws when actor lacks actor_id', () => {
    assert.throws(() => validateRequiredFields(baseParams({ actor: { actor_name: 'X', actor_role: 'HR' } })));
  });

  test('error name is EvidencePackError', () => {
    try {
      validateRequiredFields(baseParams({ actor: null }));
      assert.fail('should have thrown');
    } catch (err) {
      assert.equal(err.name, 'EvidencePackError');
    }
  });
});

// ── 3. create ─────────────────────────────────────────────────────────────────

describe('create', () => {
  test('creates pack with status OPEN', async () => {
    const svc = makeSvc();
    const pack = await svc.create(baseParams());
    assert.equal(pack.status, 'OPEN');
  });

  test('immutable_hash is set on creation', async () => {
    const svc = makeSvc();
    const pack = await svc.create(baseParams());
    assert.match(pack.immutable_hash, /^[a-f0-9]{64}$/);
  });

  test('all 5 pack types are accepted', async () => {
    const types = ['EP_WOS_RECRUIT_01', 'EP_WOS_HIRE_01', 'EP_WOS_ONBOARD_01', 'EP_WOS_PROB_01', 'EP_WOS_OFFBOARD_01'];
    for (const [i, pt] of types.entries()) {
      const svc = makeSvc();
      const pack = await svc.create(baseParams({ pack_id: `pk-${i}`, pack_type: pt }));
      assert.equal(pack.pack_type, pt);
    }
  });

  test('rejects unknown pack_type', async () => {
    const svc = makeSvc();
    await assert.rejects(
      () => svc.create(baseParams({ pack_type: 'EP_UNKNOWN' })),
      (err) => err.code === 'INVALID_PACK_TYPE',
    );
  });

  test('rejects partial pack (missing action)', async () => {
    const svc = makeSvc();
    await assert.rejects(
      () => svc.create(baseParams({ action: null })),
      { name: 'EvidencePackError' },
    );
  });

  test('duplicate pack_id throws', async () => {
    const svc = makeSvc();
    await svc.create(baseParams());
    await assert.rejects(
      () => svc.create(baseParams()),
      (err) => err.code === 'DUPLICATE_PACK',
    );
  });
});

// ── 4. verifyHash / EvidenceIntegrityError ────────────────────────────────────

describe('verifyHash / EvidenceIntegrityError', () => {
  test('verifyHash does not throw for untampered pack', async () => {
    const svc = makeSvc();
    const pack = await svc.create(baseParams());
    assert.doesNotThrow(() => verifyHash(pack));
  });

  test('verifyHash throws EvidenceIntegrityError for tampered pack', () => {
    const pack = { ...baseParams(), immutable_hash: 'deadbeef' };
    try {
      verifyHash(pack);
      assert.fail('should have thrown');
    } catch (err) {
      assert.equal(err.name, 'EvidenceIntegrityError');
      assert.equal(err.code, 'INTEGRITY_VIOLATION');
    }
  });

  test('get() throws EvidenceIntegrityError for store-level tampered pack', async () => {
    const store = makeStore();
    const svc = createEvidencePackService({ store });
    const pack = await svc.create(baseParams());

    // Tamper directly in the store's internal map
    const internal = store._packs.get(pack.pack_id);
    internal.data_snapshot = { tampered: true };

    await assert.rejects(
      () => svc.get(pack.pack_id, pack.tenant_id),
      { name: 'EvidenceIntegrityError' },
    );
  });
});

// ── 5. close ──────────────────────────────────────────────────────────────────

describe('close', () => {
  test('closes an OPEN pack', async () => {
    const svc = makeSvc();
    await svc.create(baseParams());
    const closed = await svc.close('pack-001', 'tenant-abc', 'hr-user');
    assert.equal(closed.status, 'CLOSED');
    assert.ok(closed.closed_at);
    assert.equal(closed.closed_by, 'hr-user');
  });

  test('cannot close an already CLOSED pack', async () => {
    const svc = makeSvc();
    await svc.create(baseParams());
    await svc.close('pack-001', 'tenant-abc', 'hr-user');
    await assert.rejects(
      () => svc.close('pack-001', 'tenant-abc', 'hr-user'),
      (err) => err.code === 'PACK_NOT_OPEN',
    );
  });

  test('close enforces tenant isolation', async () => {
    const svc = makeSvc();
    await svc.create(baseParams());
    await assert.rejects(
      () => svc.close('pack-001', 'wrong-tenant', 'usr'),
      (err) => err.code === 'TENANT_MISMATCH',
    );
  });
});

// ── 6. append operations ──────────────────────────────────────────────────────

describe('attach / addApproval / addAiArtifact — closed pack immutability', () => {
  test('cannot attach files to CLOSED pack', async () => {
    const svc = makeSvc();
    await svc.create(baseParams());
    await svc.close('pack-001', 'tenant-abc', 'usr');
    await assert.rejects(
      () => svc.attach('pack-001', 'tenant-abc', [{ file_id: 'f1', file_name: 'x.pdf', uploaded_by: 'HR' }]),
      (err) => err.code === 'PACK_CLOSED',
    );
  });

  test('cannot add approval to CLOSED pack', async () => {
    const svc = makeSvc();
    await svc.create(baseParams());
    await svc.close('pack-001', 'tenant-abc', 'usr');
    await assert.rejects(
      () => svc.addApproval('pack-001', 'tenant-abc', { approver_id: 'a1', approver_role: 'HR', decision: 'APPROVED' }),
      (err) => err.code === 'PACK_CLOSED',
    );
  });

  test('cannot add AI artifact to CLOSED pack', async () => {
    const svc = makeSvc();
    await svc.create(baseParams());
    await svc.close('pack-001', 'tenant-abc', 'usr');
    await assert.rejects(
      () => svc.addAiArtifact('pack-001', 'tenant-abc', { model_version: 'gpt-4', output_snapshot: { result: 'ok' } }),
      (err) => err.code === 'PACK_CLOSED',
    );
  });

  test('can attach files to OPEN pack', async () => {
    const svc = makeSvc();
    await svc.create(baseParams());
    const updated = await svc.attach('pack-001', 'tenant-abc', [{ file_id: 'f1', file_name: 'x.pdf', uploaded_by: 'HR' }]);
    assert.equal(updated.attached_files.length, 1);
  });
});

// ── 7. export ─────────────────────────────────────────────────────────────────

describe('export', () => {
  test('can only export CLOSED packs', async () => {
    const svc = makeSvc();
    await svc.create(baseParams());
    await assert.rejects(
      () => svc.export('pack-001', 'tenant-abc', 'JSON', 'HR'),
      (err) => err.code === 'PACK_NOT_CLOSED',
    );
  });

  test('export CLOSED pack returns pack_id and format', async () => {
    const svc = makeSvc();
    await svc.create(baseParams());
    await svc.close('pack-001', 'tenant-abc', 'usr');
    const result = await svc.export('pack-001', 'tenant-abc', 'JSON', 'HR');
    assert.equal(result.pack_id, 'pack-001');
    assert.equal(result.format, 'JSON');
    assert.ok(result.exported_at);
  });

  test('rejects unsupported export format', async () => {
    const svc = makeSvc();
    await svc.create(baseParams());
    await svc.close('pack-001', 'tenant-abc', 'usr');
    await assert.rejects(
      () => svc.export('pack-001', 'tenant-abc', 'XML', 'HR'),
      (err) => err.code === 'INVALID_FORMAT',
    );
  });
});

// ── 8. tenant isolation ───────────────────────────────────────────────────────

describe('tenant isolation', () => {
  test('get() blocks cross-tenant access', async () => {
    const svc = makeSvc();
    await svc.create(baseParams());
    await assert.rejects(
      () => svc.get('pack-001', 'other-tenant'),
      (err) => err.code === 'TENANT_MISMATCH',
    );
  });

  test('listByTenant returns only matching tenant packs', async () => {
    const svc = makeSvc();
    await svc.create(baseParams({ pack_id: 'pk-1', tenant_id: 'tenant-A' }));
    await svc.create(baseParams({ pack_id: 'pk-2', tenant_id: 'tenant-B' }));
    const list = await svc.listByTenant('tenant-A');
    assert.equal(list.length, 1);
    assert.equal(list[0].pack_id, 'pk-1');
  });
});

// ── 9. redaction by role ──────────────────────────────────────────────────────

describe('redaction', () => {
  test('VIEWER cannot see national_id in data_snapshot', async () => {
    const svc = makeSvc();
    await svc.create(baseParams({
      data_snapshot: { contract_id: 'c1', national_id: 'SA9999' },
    }));
    const pack = await svc.get('pack-001', 'tenant-abc', 'VIEWER');
    assert.equal(pack.data_snapshot.national_id, '[REDACTED]');
    assert.equal(pack.data_snapshot.contract_id, 'c1');
  });

  test('HR can see national_id', async () => {
    const svc = makeSvc();
    await svc.create(baseParams({
      data_snapshot: { contract_id: 'c1', national_id: 'SA9999' },
    }));
    const pack = await svc.get('pack-001', 'tenant-abc', 'HR');
    assert.equal(pack.data_snapshot.national_id, 'SA9999');
  });

  test('FINANCE cannot see national_id but can see salary', async () => {
    const svc = makeSvc();
    await svc.create(baseParams({
      data_snapshot: { salary: 5000, national_id: 'SA9999' },
    }));
    const pack = await svc.get('pack-001', 'tenant-abc', 'FINANCE');
    assert.equal(pack.data_snapshot.national_id, '[REDACTED]');
    assert.equal(pack.data_snapshot.salary, 5000);
  });

  test('redaction is non-destructive — original pack in store is unchanged', async () => {
    const store = makeStore();
    const svc = createEvidencePackService({ store });
    await svc.create(baseParams({
      data_snapshot: { salary: 5000, national_id: 'SA9999' },
    }));
    // Get as VIEWER (would redact both)
    await svc.get('pack-001', 'tenant-abc', 'VIEWER');
    // Now get as HR — should still see real values
    const pack = await svc.get('pack-001', 'tenant-abc', 'HR');
    assert.equal(pack.data_snapshot.national_id, 'SA9999');
    assert.equal(pack.data_snapshot.salary, 5000);
  });
});

// ── 10. contract_service EP wiring ────────────────────────────────────────────

describe('contract_service EP wiring (EP_WOS_HIRE_01)', () => {
  const { createContractService, InMemoryContractStore } = require('../app/modules/onboarding/contract_service');

  test('creates EP_WOS_HIRE_01 on CONTRACT_SIGNED when evidencePackService provided', async () => {
    const contractStore = new InMemoryContractStore();
    const hooks = { publish: async () => {} };
    const epStore = makeStore();
    const epSvc = makeSvc(epStore);

    const svc = createContractService({ store: contractStore, hooks, evidencePackService: epSvc });

    await svc.draftContract({
      contract_id: 'ctr-1', worker_id: 'wrk-1', onboarding_case_id: 'obc-1',
      tenant_id: 'tenant-abc', event_id: 'e1', occurred_at: new Date().toISOString(), created_at: new Date().toISOString(),
    });

    await svc.transitionContract({
      contract_id: 'ctr-1', next_status: 'SIGNED', updated_at: new Date().toISOString(),
      evidence_pack_id: 'ep-hire-1', event_id: 'e2', occurred_at: new Date().toISOString(),
    });

    const ep = await epStore.get('ep-hire-1');
    assert.ok(ep, 'EP should exist in store');
    assert.equal(ep.pack_type, 'EP_WOS_HIRE_01');
    assert.equal(ep.tenant_id, 'tenant-abc');
  });

  test('skips EP creation when evidencePackService absent (backward compatible)', async () => {
    const contractStore = new InMemoryContractStore();
    const hooks = { publish: async () => {} };
    const svc = createContractService({ store: contractStore, hooks });

    await svc.draftContract({
      contract_id: 'ctr-2', worker_id: 'wrk-2', onboarding_case_id: 'obc-2',
      tenant_id: 'tenant-abc', event_id: 'e1', occurred_at: new Date().toISOString(), created_at: new Date().toISOString(),
    });

    // Should not throw
    await assert.doesNotReject(() =>
      svc.transitionContract({
        contract_id: 'ctr-2', next_status: 'SIGNED', updated_at: new Date().toISOString(),
        evidence_pack_id: 'ep-hire-2', event_id: 'e2', occurred_at: new Date().toISOString(),
      }),
    );
  });
});

// ── 11. probation_service EP wiring ──────────────────────────────────────────

describe('probation_service EP wiring (EP_WOS_PROB_01)', () => {
  const { createProbationService, InMemoryProbationStore } = require('../app/modules/onboarding/probation_service');

  test('creates EP_WOS_PROB_01 on recordDecision when evidencePackService provided', async () => {
    const probStore = new InMemoryProbationStore();
    const hooks = { publish: async () => {} };
    const epStore = makeStore();
    const epSvc = makeSvc(epStore);

    const svc = createProbationService({ store: probStore, hooks, evidencePackService: epSvc });

    await svc.openProbationCase({
      probation_case_id: 'prob-1', worker_id: 'wrk-1', tenant_id: 'tenant-abc', onboarding_case_id: 'obc-1',
    });

    await svc.recordDecision({
      probation_case_id: 'prob-1', decision: 'CONFIRM',
      evidence_pack_id: 'ep-prob-1', event_id: 'e1', occurred_at: new Date().toISOString(),
      actor: { actor_id: 'hr-1', actor_name: 'Bob', actor_type: 'HR' },
    });

    const ep = await epStore.get('ep-prob-1');
    assert.ok(ep, 'EP should exist in store');
    assert.equal(ep.pack_type, 'EP_WOS_PROB_01');
  });

  test('skips EP creation when evidencePackService absent', async () => {
    const probStore = new InMemoryProbationStore();
    const hooks = { publish: async () => {} };
    const svc = createProbationService({ store: probStore, hooks });

    await svc.openProbationCase({
      probation_case_id: 'prob-2', worker_id: 'wrk-2', tenant_id: 'tenant-abc', onboarding_case_id: 'obc-2',
    });

    await assert.doesNotReject(() =>
      svc.recordDecision({
        probation_case_id: 'prob-2', decision: 'TERMINATE',
        event_id: 'e1', occurred_at: new Date().toISOString(),
      }),
    );
  });
});

// ── 12. offboarding_service EP wiring ────────────────────────────────────────

describe('offboarding_service EP wiring (EP_WOS_OFFBOARD_01)', () => {
  const { createOffboardingService, InMemoryOffboardingStore } = require('../app/modules/lifecycle/offboarding_service');

  test('creates EP_WOS_OFFBOARD_01 on generateEvidencePack when evidencePackService provided', async () => {
    const offStore = new InMemoryOffboardingStore();
    const hooks = { publish: async () => {} };
    const epStore = makeStore();
    const epSvc = makeSvc(epStore);

    const svc = createOffboardingService({ store: offStore, hooks, evidencePackService: epSvc });

    await svc.initiateCase({
      offboarding_case_id: 'off-1', worker_id: 'wrk-1', tenant_id: 'tenant-abc',
    });

    await svc.generateEvidencePack({
      offboarding_case_id: 'off-1', tenant_id: 'tenant-abc',
      evidence_pack_id: 'ep-off-1', handover_count: 3,
    });

    const ep = await epStore.get('ep-off-1');
    assert.ok(ep, 'EP should exist in store');
    assert.equal(ep.pack_type, 'EP_WOS_OFFBOARD_01');
    assert.equal(ep.tenant_id, 'tenant-abc');
  });

  test('skips EP creation when evidencePackService absent', async () => {
    const offStore = new InMemoryOffboardingStore();
    const hooks = { publish: async () => {} };
    const svc = createOffboardingService({ store: offStore, hooks });

    await svc.initiateCase({
      offboarding_case_id: 'off-2', worker_id: 'wrk-2', tenant_id: 'tenant-abc',
    });

    await assert.doesNotReject(() =>
      svc.generateEvidencePack({
        offboarding_case_id: 'off-2', tenant_id: 'tenant-abc',
        evidence_pack_id: 'ep-off-2',
      }),
    );
  });
});
