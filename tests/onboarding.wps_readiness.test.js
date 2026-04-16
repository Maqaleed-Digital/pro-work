'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const {
  createWpsReadinessService,
  InMemoryWpsReadinessStore,
  validateIban,
  generateWpsDataPackage,
  buildEvidencePack,
  POLICY,
} = require('../app/modules/onboarding/wps_readiness_service');

// ── fixtures ──────────────────────────────────────────────────────────────────

const PACK_ID   = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const WORKER_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const TENANT_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
const CASE_ID   = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
const EP_ID     = 'ep-001';

// Valid 24-char Saudi IBAN (bank code "10" = Al Rajhi)
const VALID_KSA_IBAN   = 'SA0380000000608010167519';
// Valid IBAN with bank code "20" = Riyad Bank
const VALID_KSA_IBAN_2 = 'SA4420000001234567891234';
const INVALID_IBAN_SHORT = 'SA0380000000608';
const INVALID_COUNTRY    = 'GB00123456789012345678901234';

const ACTOR = { actor_type: 'HUMAN', actor_id: 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee' };

const SALARY_DATA = {
  basicSalary:        5000,
  housingAllowance:   1500,
  transportAllowance:  500,
  totalSalary:        7000,
  paymentMonth:          4,
  paymentYear:        2026,
  currency:          'SAR',
};

function makeHooks() {
  const events = [];
  return { events, publish: async (e) => events.push(e) };
}

function makeSvc(hooks) {
  return createWpsReadinessService({
    store: new InMemoryWpsReadinessStore(),
    hooks: hooks || makeHooks(),
  });
}

function baseInput(overrides) {
  return {
    pack_id:            PACK_ID,
    worker_id:          WORKER_ID,
    tenant_id:          TENANT_ID,
    onboarding_case_id: CASE_ID,
    evidence_pack_id:   EP_ID,
    iban:               VALID_KSA_IBAN,
    national_id:        '1234567890',
    identity_verification_status: 'VERIFIED',
    bank_confirmation_status:     'CONFIRMED',
    salary_data:        SALARY_DATA,
    occurred_at:        '2026-04-16T10:00:00Z',
    actor:              ACTOR,
    event_id:           'ev-wps-001',
    correlation_id:     'corr-001',
    causation_id:       'caus-001',
    ...overrides,
  };
}

// ── validateIban ──────────────────────────────────────────────────────────────

describe('validateIban', () => {
  test('returns valid=true for correct 24-char KSA IBAN', () => {
    const r = validateIban(VALID_KSA_IBAN);
    assert.equal(r.valid, true);
    assert.equal(r.country, 'SA');
    assert.ok(r.bank, 'bank name populated');
    assert.ok(r.ibanHash, 'ibanHash present');
    assert.ok(!('iban' in r), 'raw IBAN must not appear in result');
  });

  test('ibanHash is deterministic — same input, same hash', () => {
    const r1 = validateIban(VALID_KSA_IBAN);
    const r2 = validateIban(VALID_KSA_IBAN);
    assert.equal(r1.ibanHash, r2.ibanHash);
  });

  test('strips spaces before validation', () => {
    const spaced = 'SA03 8000 0000 6080 1016 7519';
    const r = validateIban(spaced);
    assert.equal(r.valid, true);
  });

  test('returns valid=false for too-short IBAN', () => {
    const r = validateIban(INVALID_IBAN_SHORT);
    assert.equal(r.valid, false);
    assert.ok(r.reason.includes('24'), 'reason mentions expected length');
    assert.ok(r.ibanHash, 'hash still returned for audit');
  });

  test('returns valid=false for non-KSA country code', () => {
    const r = validateIban(INVALID_COUNTRY);
    assert.equal(r.valid, false);
    assert.ok(r.reason.includes('SA'));
  });

  test('throws when iban argument is empty string', () => {
    assert.throws(() => validateIban(''), /iban is required/);
  });
});

// ── generateWpsDataPackage ────────────────────────────────────────────────────

describe('generateWpsDataPackage', () => {
  test('returns structureValid=true when all salary fields present', () => {
    const ibanResult = validateIban(VALID_KSA_IBAN);
    const pkg = generateWpsDataPackage({
      workerId:   WORKER_ID,
      nationalId: '1234567890',
      bankCode:   ibanResult.bankCode,
      rawIban:    VALID_KSA_IBAN,
      salaryData: SALARY_DATA,
    });
    assert.equal(pkg.structureValid, true);
    assert.equal(pkg.missingFields.length, 0);
    assert.ok(!('iban' in pkg), 'raw IBAN must not be in package');
    assert.ok(pkg.ibanHash, 'ibanHash present in package');
  });

  test('returns structureValid=false when totalSalary missing', () => {
    const { totalSalary: _, ...partial } = SALARY_DATA;
    const pkg = generateWpsDataPackage({
      workerId: WORKER_ID, nationalId: '1234567890',
      bankCode: '10', rawIban: VALID_KSA_IBAN, salaryData: partial,
    });
    assert.equal(pkg.structureValid, false);
    assert.ok(pkg.missingFields.includes('totalSalary'));
  });

  test('packageVersion contains policy prefix from config', () => {
    const pkg = generateWpsDataPackage({
      workerId: WORKER_ID, nationalId: '1234567890',
      bankCode: '10', rawIban: VALID_KSA_IBAN, salaryData: SALARY_DATA,
    });
    assert.ok(pkg.packageVersion.startsWith('WPS'));
  });
});

// ── generateReadinessPack ─────────────────────────────────────────────────────

describe('WpsReadinessService — generateReadinessPack', () => {
  test('returns pack with all status fields', async () => {
    const svc  = makeSvc();
    const pack = await svc.generateReadinessPack(baseInput());
    assert.equal(pack.pack_id,   PACK_ID);
    assert.equal(pack.worker_id, WORKER_ID);
    assert.ok(['VERIFIED','PENDING','FAILED'].includes(pack.iban_status));
    assert.ok(['VERIFIED','PENDING','FAILED'].includes(pack.identity_verification_status));
    assert.ok(['CONFIRMED','PENDING','FAILED'].includes(pack.bank_confirmation_status));
  });

  test('raw IBAN never present in stored pack', async () => {
    const svc  = makeSvc();
    const pack = await svc.generateReadinessPack(baseInput());
    const json = JSON.stringify(pack);
    assert.ok(!json.includes(VALID_KSA_IBAN), 'raw IBAN must not appear in pack');
    assert.ok(pack.iban_hash, 'iban_hash present');
  });

  test('valid KSA IBAN results in iban_status=VERIFIED', async () => {
    const svc  = makeSvc();
    const pack = await svc.generateReadinessPack(baseInput());
    assert.equal(pack.iban_status, 'VERIFIED');
  });

  test('invalid IBAN results in iban_status=FAILED', async () => {
    const svc  = makeSvc();
    const pack = await svc.generateReadinessPack(baseInput({ iban: INVALID_IBAN_SHORT }));
    assert.equal(pack.iban_status, 'FAILED');
  });

  test('evidence pack auto-generated — no manual step', async () => {
    const svc  = makeSvc();
    const pack = await svc.generateReadinessPack(baseInput());
    assert.ok(pack.evidence_pack_id, 'evidence_pack_id populated');
    assert.ok(pack.evidence_pack,    'evidence_pack embedded in result');
    assert.equal(pack.evidence_pack.evidencePackRef, 'EP-WOS-ONBOARD-01');
  });

  test('evidence pack is complete when all 4 steps satisfied', async () => {
    const svc  = makeSvc();
    const pack = await svc.generateReadinessPack(baseInput());
    assert.equal(pack.evidence_pack.complete, true);
  });

  test('evidence pack incomplete when IBAN fails', async () => {
    const svc  = makeSvc();
    const pack = await svc.generateReadinessPack(baseInput({ iban: INVALID_IBAN_SHORT }));
    assert.equal(pack.evidence_pack.complete, false);
    assert.ok(pack.evidence_pack.missingSteps.includes('IBAN_VERIFIED'));
  });

  test('idempotent — same pack_id returns identical pack without mutation', async () => {
    const svc   = makeSvc();
    const pack1 = await svc.generateReadinessPack(baseInput());
    const pack2 = await svc.generateReadinessPack(baseInput({ occurred_at: '2026-04-16T11:00:00Z' }));
    assert.equal(pack1.pack_id,      pack2.pack_id);
    assert.equal(pack1.generated_at, pack2.generated_at, 'timestamp must not change on re-call');
  });

  test('emits WPS_READINESS_PACK_GENERATED event', async () => {
    const h   = makeHooks();
    const svc = createWpsReadinessService({ store: new InMemoryWpsReadinessStore(), hooks: h });
    await svc.generateReadinessPack(baseInput());
    const ev = h.events.find(e => e.event_type === 'WPS_READINESS_PACK_GENERATED');
    assert.ok(ev,  'event emitted');
    assert.equal(ev.trust_level, 'HIGH');
    assert.ok(!('iban' in ev.payload), 'raw IBAN not in event payload');
  });

  test('rejects missing pack_id', async () => {
    const svc = makeSvc();
    await assert.rejects(
      () => svc.generateReadinessPack(baseInput({ pack_id: '' })),
      /pack_id is required/
    );
  });

  test('rejects missing iban', async () => {
    const svc = makeSvc();
    await assert.rejects(
      () => svc.generateReadinessPack(baseInput({ iban: '' })),
      /iban is required/
    );
  });

  test('rejects invalid identity_verification_status', async () => {
    const svc = makeSvc();
    await assert.rejects(
      () => svc.generateReadinessPack(baseInput({ identity_verification_status: 'YES' })),
      /VERIFIED \| PENDING \| FAILED/
    );
  });

  test('rejects invalid bank_confirmation_status', async () => {
    const svc = makeSvc();
    await assert.rejects(
      () => svc.generateReadinessPack(baseInput({ bank_confirmation_status: 'OK' })),
      /CONFIRMED \| PENDING \| FAILED/
    );
  });
});

// ── getReadinessPack ──────────────────────────────────────────────────────────

describe('WpsReadinessService — getReadinessPack', () => {
  test('retrieves stored pack by id', async () => {
    const svc = makeSvc();
    await svc.generateReadinessPack(baseInput());
    const fetched = await svc.getReadinessPack(PACK_ID);
    assert.ok(fetched,                 'pack found');
    assert.equal(fetched.pack_id, PACK_ID);
  });

  test('returns null for unknown pack_id', async () => {
    const svc    = makeSvc();
    const result = await svc.getReadinessPack('nonexistent');
    assert.equal(result, null);
  });
});

// ── policy config ─────────────────────────────────────────────────────────────

describe('POLICY config', () => {
  test('policy version is v1', () => {
    assert.equal(POLICY.version, 'v1');
  });

  test('KSA IBAN length is 24', () => {
    assert.equal(POLICY.ibanRules.ksa.length, 24);
  });

  test('evidencePack id is EP-WOS-ONBOARD-01', () => {
    assert.equal(POLICY.evidencePack.id, 'EP-WOS-ONBOARD-01');
  });

  test('all 4 required steps defined in policy', () => {
    const required = POLICY.evidencePack.requiredSteps;
    assert.ok(required.includes('IBAN_VERIFIED'));
    assert.ok(required.includes('IDENTITY_VERIFIED'));
    assert.ok(required.includes('BANK_CONFIRMED'));
    assert.ok(required.includes('WPS_PACKAGE_GENERATED'));
  });
});
