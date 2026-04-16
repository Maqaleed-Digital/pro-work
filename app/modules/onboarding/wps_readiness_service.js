'use strict';

const crypto = require('crypto');
const path   = require('path');
const fs     = require('fs');

// Load policy config from versioned JSON — never hardcode rules
const POLICY = JSON.parse(
  fs.readFileSync(
    path.join(__dirname, '../../config/compliance/wps_policy_v1.json'),
    'utf8'
  )
);

const IBAN_RULES        = POLICY.ibanRules.ksa;
const KNOWN_BANK_CODES  = POLICY.ibanRules.knownBankCodes;
const SALARY_FIELDS     = POLICY.salaryFileFields;
const EVIDENCE_PACK_DEF = POLICY.evidencePack;
const PKG_VERSION_PREFIX = POLICY.packageVersionPrefix;

// ── helpers ──────────────────────────────────────────────────────────────────

function serviceError(message) {
  const err = new Error(message);
  err.name = 'WpsReadinessServiceError';
  return err;
}

function assert(condition, message) {
  if (!condition) throw serviceError(message);
}

function clone(v) { return JSON.parse(JSON.stringify(v)); }

function ibanHash(rawIban) {
  return crypto.createHash('sha256').update(rawIban.replace(/\s+/g, '').toUpperCase()).digest('hex');
}

function nowIso() { return new Date().toISOString(); }

// ── IBAN validation ───────────────────────────────────────────────────────────

function validateIban(iban) {
  assert(typeof iban === 'string' && iban.length > 0, 'iban is required');
  const normalised = iban.replace(/\s+/g, '').toUpperCase();

  if (normalised.length !== IBAN_RULES.length) {
    return {
      valid: false,
      reason: `IBAN must be ${IBAN_RULES.length} characters for KSA`,
      country: null,
      bank: null,
      bankCode: null,
      ibanHash: ibanHash(normalised),
    };
  }

  const country = normalised.slice(0, 2);
  if (country !== IBAN_RULES.countryCode) {
    return {
      valid: false,
      reason: `Expected country code ${IBAN_RULES.countryCode}, got ${country}`,
      country,
      bank: null,
      bankCode: null,
      ibanHash: ibanHash(normalised),
    };
  }

  const bankCode = normalised.slice(IBAN_RULES.bankCodeOffset, IBAN_RULES.bankCodeOffset + IBAN_RULES.bankCodeLength);
  const bank = KNOWN_BANK_CODES[bankCode] || null;

  return {
    valid: true,
    country,
    bank: bank || `Unknown (${bankCode})`,
    bankCode,
    ibanHash: ibanHash(normalised),
    // NEVER return raw IBAN — caller must not log or store the input
  };
}

// ── WPS data package ──────────────────────────────────────────────────────────

function generateWpsDataPackage({ workerId, nationalId, bankCode, rawIban, salaryData }) {
  assert(workerId,   'workerId is required');
  assert(nationalId, 'nationalId is required');
  assert(bankCode,   'bankCode is required');
  assert(rawIban,    'rawIban is required');
  assert(salaryData && typeof salaryData === 'object', 'salaryData is required');

  const hash = ibanHash(rawIban);

  // Validate all required salary fields are present
  const missingFields = SALARY_FIELDS.filter(f => {
    // ibanHash is derived here, not from input
    if (f === 'ibanHash') return false;
    if (f === 'bankCode') return false;
    if (f === 'employeeId') return false;
    if (f === 'nationalId') return false;
    return salaryData[f] == null;
  });

  const structureValid = missingFields.length === 0;

  const pkg = {
    packageVersion:      PKG_VERSION_PREFIX,
    employeeId:          workerId,
    nationalId,
    bankCode,
    ibanHash:            hash,   // raw IBAN never included
    basicSalary:         salaryData.basicSalary         ?? null,
    housingAllowance:    salaryData.housingAllowance     ?? null,
    transportAllowance:  salaryData.transportAllowance   ?? null,
    totalSalary:         salaryData.totalSalary          ?? null,
    paymentMonth:        salaryData.paymentMonth         ?? null,
    paymentYear:         salaryData.paymentYear          ?? null,
    currency:            salaryData.currency             ?? POLICY.currency,
    structureValid,
    missingFields,
    generatedAt:         nowIso(),
  };

  return pkg;
}

// ── Evidence pack (EP-WOS-ONBOARD-01) ────────────────────────────────────────

function buildEvidencePack({ packId, workerId, tenantId, onboardingCaseId, steps }) {
  const completedStepIds = steps.map(s => s.stepId);
  const allRequired      = EVIDENCE_PACK_DEF.requiredSteps;
  const missingSteps     = allRequired.filter(s => !completedStepIds.includes(s));

  return {
    evidencePackId:    packId,
    evidencePackRef:   EVIDENCE_PACK_DEF.id,
    version:           EVIDENCE_PACK_DEF.version,
    workerId,
    tenantId,
    onboardingCaseId,
    steps:             clone(steps),
    requiredSteps:     allRequired,
    missingSteps,
    complete:          missingSteps.length === 0,
    generatedAt:       nowIso(),
  };
}

// ── In-memory store (append-only for evidence; upsert for readiness records) ──

class InMemoryWpsReadinessStore {
  constructor() {
    this._packs          = new Map();
    this._evidencePacks  = new Map();
  }

  // Readiness packs: upsert — idempotent on pack_id
  async upsertPack(pack) {
    const key = pack.pack_id;
    assert(key, 'pack.pack_id is required');
    const existing = this._packs.get(key);
    if (existing) {
      // Idempotent: return existing without mutation
      return clone(existing);
    }
    const frozen = Object.freeze(clone(pack));
    this._packs.set(key, frozen);
    return clone(frozen);
  }

  async getPack(packId) {
    return this._packs.has(packId) ? clone(this._packs.get(packId)) : null;
  }

  async allPacks() {
    return Array.from(this._packs.values()).map(clone);
  }

  // Evidence packs: append-only
  async insertEvidencePack(ep) {
    const key = ep.evidencePackId;
    assert(key, 'evidencePackId is required');
    assert(!this._evidencePacks.has(key), `evidence pack already exists: ${key}`);
    const frozen = Object.freeze(clone(ep));
    this._evidencePacks.set(key, frozen);
    return clone(frozen);
  }

  async getEvidencePack(epId) {
    return this._evidencePacks.has(epId) ? clone(this._evidencePacks.get(epId)) : null;
  }
}

// ── Service factory ───────────────────────────────────────────────────────────

function createWpsReadinessService({ store, hooks }) {
  assert(store,  'store is required');
  assert(hooks && typeof hooks.publish === 'function', 'hooks.publish is required');

  return {
    // Expose for direct use in tests/routes
    validateIban,
    generateWpsDataPackage,

    /**
     * generateReadinessPack — idempotent on pack_id.
     * IBAN is accepted for validation + hashing; raw value is NEVER persisted.
     */
    async generateReadinessPack(input) {
      assert(input && typeof input === 'object', 'input is required');
      assert(input.pack_id,            'pack_id is required');
      assert(input.worker_id,          'worker_id is required');
      assert(input.tenant_id,          'tenant_id is required');
      assert(input.onboarding_case_id, 'onboarding_case_id is required');
      assert(input.iban,               'iban is required');
      assert(input.national_id,        'national_id is required');
      assert(input.salary_data && typeof input.salary_data === 'object', 'salary_data is required');

      // Validate IBAN — extract hash + bank info; raw value not stored
      const ibanResult = validateIban(input.iban);
      const ibanStatus = ibanResult.valid ? 'VERIFIED' : 'FAILED';

      // Identity status from explicit flag or default PENDING
      const identityStatus = input.identity_verification_status || 'PENDING';
      assert(
        ['VERIFIED', 'PENDING', 'FAILED'].includes(identityStatus),
        'identity_verification_status must be VERIFIED | PENDING | FAILED'
      );

      // Bank confirmation status
      const bankStatus = input.bank_confirmation_status || 'PENDING';
      assert(
        ['CONFIRMED', 'PENDING', 'FAILED'].includes(bankStatus),
        'bank_confirmation_status must be CONFIRMED | PENDING | FAILED'
      );

      // Build WPS data package (raw IBAN used here only for hashing)
      const wpsPackage = generateWpsDataPackage({
        workerId:   input.worker_id,
        nationalId: input.national_id,
        bankCode:   ibanResult.bankCode || input.bank_code || '00',
        rawIban:    input.iban,
        salaryData: input.salary_data,
      });

      // Steps completed so far
      const steps = [];
      if (ibanStatus === 'VERIFIED') {
        steps.push({
          stepId:      'IBAN_VERIFIED',
          completedAt: input.occurred_at || nowIso(),
          verifiedBy:  input.actor ? input.actor.actor_id : null,
          ibanHash:    ibanResult.ibanHash,
          bank:        ibanResult.bank,
          bankCode:    ibanResult.bankCode,
        });
      }
      if (identityStatus === 'VERIFIED') {
        steps.push({
          stepId:             'IDENTITY_VERIFIED',
          completedAt:        input.occurred_at || nowIso(),
          verifiedBy:         input.actor ? input.actor.actor_id : null,
          identityDocumentId: input.identity_document_id || null,
        });
      }
      if (bankStatus === 'CONFIRMED') {
        steps.push({
          stepId:      'BANK_CONFIRMED',
          completedAt: input.occurred_at || nowIso(),
          bankCode:    ibanResult.bankCode || input.bank_code || '00',
        });
      }
      if (wpsPackage.structureValid) {
        steps.push({
          stepId:       'WPS_PACKAGE_GENERATED',
          completedAt:  wpsPackage.generatedAt,
          packageVersion: wpsPackage.packageVersion,
        });
      }

      // Build evidence pack — auto-generates, no manual step
      const ep = buildEvidencePack({
        packId:          input.evidence_pack_id || `ep-${input.pack_id}`,
        workerId:        input.worker_id,
        tenantId:        input.tenant_id,
        onboardingCaseId: input.onboarding_case_id,
        steps,
      });

      // Assemble the readiness pack record
      const pack = {
        pack_id:                      input.pack_id,
        worker_id:                    input.worker_id,
        tenant_id:                    input.tenant_id,
        onboarding_case_id:           input.onboarding_case_id,
        // IBAN never stored raw — hash + bank only
        iban_hash:                    ibanResult.ibanHash,
        bank_code:                    ibanResult.bankCode || null,
        bank_name:                    ibanResult.bank    || null,
        iban_status:                  ibanStatus,
        identity_verification_status: identityStatus,
        bank_confirmation_status:     bankStatus,
        wps_package:                  wpsPackage,
        evidence_pack_id:             ep.evidencePackId,
        evidence_pack:                ep,
        generated_at:                 input.occurred_at || nowIso(),
        policy_version:               POLICY.version,
      };

      // Upsert — idempotent (same pack_id returns existing without change)
      const stored = await store.upsertPack(pack);

      // Store evidence pack only on first insert
      const existingEp = await store.getEvidencePack(ep.evidencePackId);
      if (!existingEp) {
        await store.insertEvidencePack(ep);
      }

      await hooks.publish({
        event_id:       input.event_id,
        event_type:     'WPS_READINESS_PACK_GENERATED',
        event_version:  '1.0',
        occurred_at:    input.occurred_at || nowIso(),
        tenant_id:      input.tenant_id,
        aggregate_type: 'ONBOARDING_CASE',
        aggregate_id:   input.onboarding_case_id,
        actor:          input.actor,
        correlation_id: input.correlation_id,
        causation_id:   input.causation_id,
        source: {
          service:     'onboarding',
          module:      'wps_readiness_service',
          environment: process.env.NODE_ENV || 'development',
        },
        trust_level:      'HIGH',
        requires_approval: false,
        payload: {
          pack_id:          stored.pack_id,
          worker_id:        stored.worker_id,
          iban_status:      stored.iban_status,
          identity_status:  stored.identity_verification_status,
          bank_status:      stored.bank_confirmation_status,
          evidence_pack_id: stored.evidence_pack_id,
          steps_completed:  steps.length,
          evidence_complete: ep.complete,
        },
        metadata: input.metadata || {},
      });

      return stored;
    },

    async getReadinessPack(packId) {
      assert(packId, 'packId is required');
      return store.getPack(packId);
    },

    async getEvidencePack(epId) {
      assert(epId, 'epId is required');
      return store.getEvidencePack(epId);
    },
  };
}

module.exports = {
  createWpsReadinessService,
  InMemoryWpsReadinessStore,
  validateIban,
  generateWpsDataPackage,
  buildEvidencePack,
  POLICY,
};
