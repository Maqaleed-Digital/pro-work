'use strict';

const crypto = require('crypto');
const path   = require('path');
const fs     = require('fs');

const POLICY = JSON.parse(
  fs.readFileSync(
    path.join(__dirname, '../../config/evidence/evidence_pack_policy_v1.json'),
    'utf8'
  )
);

const PACK_TYPES      = new Set(POLICY.packTypes);
const REQUIRED_FIELDS = POLICY.requiredFields;
const HASH_FIELDS     = POLICY.hashCoreFields;

const { applyRedactionRules } = require('./redaction_service');

// ── error types ───────────────────────────────────────────────────────────────

function evidenceError(message, code) {
  const err = new Error(message);
  err.name  = 'EvidencePackError';
  err.code  = code || 'EVIDENCE_ERROR';
  return err;
}

function integrityError(message, packId) {
  const err = new Error(message);
  err.name   = 'EvidenceIntegrityError';
  err.code   = 'INTEGRITY_VIOLATION';
  err.packId = packId;
  return err;
}

function assert(condition, message, code) {
  if (!condition) throw evidenceError(message, code);
}

function clone(v) { return JSON.parse(JSON.stringify(v)); }
function nowIso() { return new Date().toISOString(); }

// ── hash computation ──────────────────────────────────────────────────────────

/**
 * computeImmutableHash — SHA-256 over canonical JSON of the immutable core fields.
 * Hash covers: pack_id, pack_type, tenant_id, actor, action, timestamp, data_snapshot.
 * These fields are set at creation and never mutated.
 */
function computeImmutableHash(pack) {
  const core = {};
  HASH_FIELDS.forEach(f => { core[f] = pack[f] ?? null; });
  return crypto.createHash(POLICY.hashAlgorithm)
    .update(JSON.stringify(core))
    .digest('hex');
}

/**
 * verifyHash — recomputes hash and compares to stored immutable_hash.
 * Throws EvidenceIntegrityError on mismatch — never silently passes.
 */
function verifyHash(pack) {
  const expected = computeImmutableHash(pack);
  if (pack.immutable_hash !== expected) {
    throw integrityError(
      `Evidence pack integrity violation: pack_id=${pack.pack_id} — stored hash does not match computed hash`,
      pack.pack_id
    );
  }
}

// ── required field validation ─────────────────────────────────────────────────

/**
 * validateRequiredFields — all 8 required fields must be present (non-null/undefined).
 * Used at pack create and before close.
 * Throws EvidencePackError listing all missing fields.
 */
function validateRequiredFields(pack) {
  const missing = [];
  for (const field of REQUIRED_FIELDS) {
    const v = pack[field];
    if (v === null || v === undefined) {
      missing.push(field);
    } else if (field === 'actor') {
      if (!v.actor_id || !v.actor_name || !v.actor_role) missing.push('actor.{actor_id,actor_name,actor_role}');
    } else if (field === 'action') {
      if (String(v).trim() === '') missing.push('action (empty string)');
    }
  }
  if (missing.length > 0) {
    throw evidenceError(
      `Pack is missing required fields — cannot proceed: ${missing.join(', ')}`,
      'MISSING_REQUIRED_FIELDS'
    );
  }
}

// ── in-memory store ───────────────────────────────────────────────────────────

class InMemoryEvidencePackStore {
  constructor() {
    this._packs = new Map();
  }

  async insert(pack) {
    assert(!this._packs.has(pack.pack_id), `evidence pack already exists: ${pack.pack_id}`, 'DUPLICATE_PACK');
    const frozen = clone(pack);
    this._packs.set(pack.pack_id, frozen);
    return clone(frozen);
  }

  async get(packId) {
    return this._packs.has(packId) ? clone(this._packs.get(packId)) : null;
  }

  async updateStatus(packId, patch) {
    const current = this._packs.get(packId);
    assert(current, `evidence pack not found: ${packId}`, 'PACK_NOT_FOUND');
    const next = { ...current, ...clone(patch) };
    this._packs.set(packId, next);
    return clone(next);
  }

  async appendToField(packId, field, item) {
    const current = this._packs.get(packId);
    assert(current, `evidence pack not found: ${packId}`, 'PACK_NOT_FOUND');
    assert(current.status === 'OPEN', `cannot append to ${field}: pack ${packId} is ${current.status} — closed packs are immutable`, 'PACK_CLOSED');
    assert(Array.isArray(current[field]), `field ${field} is not an array`);
    const next = { ...current, [field]: [...current[field], clone(item)] };
    this._packs.set(packId, next);
    return clone(next);
  }

  async allByTenant(tenantId) {
    return Array.from(this._packs.values())
      .filter(p => p.tenant_id === tenantId)
      .map(clone);
  }

  async allPacks() {
    return Array.from(this._packs.values()).map(clone);
  }
}

// ── service factory ───────────────────────────────────────────────────────────

/**
 * createEvidencePackService({ store })
 *
 * Methods:
 *   create(params)                       — validates 8 fields, hashes, inserts
 *   attach(packId, tenantId, files)      — appends files to OPEN pack
 *   addApproval(packId, tenantId, appr)  — appends to approval_chain of OPEN pack
 *   addAiArtifact(packId, tenantId, art) — appends to ai_artifacts of OPEN pack
 *   close(packId, tenantId, closedBy)    — validates 8 fields, sets CLOSED
 *   get(packId, tenantId, requestingRole)— verifies hash, returns redacted view
 *   export(packId, tenantId, format, requestingRole) — marks EXPORTED, returns redacted data
 *   listByTenant(tenantId)               — returns all packs for tenant (no hash verify per item)
 */
function createEvidencePackService({ store }) {
  assert(store, 'store is required');

  // ── create ──────────────────────────────────────────────────────────────────

  async function create(params) {
    assert(params && typeof params === 'object', 'params is required');
    assert(params.pack_id,   'pack_id is required');
    assert(params.pack_type, 'pack_type is required');
    assert(params.tenant_id, 'tenant_id is required');
    assert(PACK_TYPES.has(params.pack_type), `Unknown pack_type: ${params.pack_type}. Must be one of: ${[...PACK_TYPES].join(', ')}`, 'INVALID_PACK_TYPE');

    const pack = {
      pack_id:         params.pack_id,
      pack_type:       params.pack_type,
      tenant_id:       params.tenant_id,
      status:          'OPEN',
      // Core 8 required fields — timestamp is immutable, set here
      actor:           params.actor         ?? null,
      action:          params.action        ?? null,
      timestamp:       params.timestamp     || nowIso(),
      data_snapshot:   params.data_snapshot ?? null,
      attached_files:  params.attached_files  ?? [],
      approval_chain:  params.approval_chain  ?? [],
      ai_artifacts:    params.ai_artifacts    ?? [],
      redaction_rules: params.redaction_rules ?? [],
      // Lifecycle fields
      created_at:      nowIso(),
      closed_at:       null,
      closed_by:       null,
      exported_at:     null,
      immutable_hash:  null,   // set below after validation
      policy_version:  POLICY.version,
    };

    // Validate all 8 required fields before inserting
    validateRequiredFields(pack);

    // Compute and attach immutable hash
    pack.immutable_hash = computeImmutableHash(pack);

    const stored = await store.insert(pack);
    return stored;
  }

  // ── attach files ─────────────────────────────────────────────────────────────

  async function attach(packId, tenantId, files) {
    assert(packId,   'packId is required');
    assert(tenantId, 'tenantId is required');
    assert(Array.isArray(files) && files.length > 0, 'files must be a non-empty array');

    // Verify tenant before mutation
    const existing = await store.get(packId);
    assert(existing,                     `pack not found: ${packId}`,             'PACK_NOT_FOUND');
    assert(existing.tenant_id === tenantId, `cross-tenant access denied`,          'TENANT_MISMATCH');
    assert(existing.status === 'OPEN',    `cannot attach to ${existing.status} pack`, 'PACK_CLOSED');
    verifyHash(existing);

    let current = existing;
    for (const file of files) {
      assert(file.file_id,    'each file must have file_id');
      assert(file.file_name,  'each file must have file_name');
      assert(file.uploaded_by, 'each file must have uploaded_by');
      current = await store.appendToField(packId, 'attached_files', {
        ...file,
        uploaded_at: file.uploaded_at || nowIso(),
      });
    }
    return current;
  }

  // ── add approval ──────────────────────────────────────────────────────────────

  async function addApproval(packId, tenantId, approval) {
    assert(packId,   'packId is required');
    assert(tenantId, 'tenantId is required');
    assert(approval && approval.approver_id,   'approval.approver_id is required');
    assert(approval.approver_role,             'approval.approver_role is required');
    assert(approval.decision,                  'approval.decision is required');

    const existing = await store.get(packId);
    assert(existing,                     `pack not found: ${packId}`,             'PACK_NOT_FOUND');
    assert(existing.tenant_id === tenantId, `cross-tenant access denied`,          'TENANT_MISMATCH');
    assert(existing.status === 'OPEN',    `cannot modify ${existing.status} pack`, 'PACK_CLOSED');
    verifyHash(existing);

    return store.appendToField(packId, 'approval_chain', {
      ...approval,
      timestamp: approval.timestamp || nowIso(),
    });
  }

  // ── add AI artifact ───────────────────────────────────────────────────────────

  async function addAiArtifact(packId, tenantId, artifact) {
    assert(packId,   'packId is required');
    assert(tenantId, 'tenantId is required');
    assert(artifact && artifact.model_version,  'artifact.model_version is required');
    assert(artifact.output_snapshot,            'artifact.output_snapshot is required');

    const existing = await store.get(packId);
    assert(existing,                     `pack not found: ${packId}`,             'PACK_NOT_FOUND');
    assert(existing.tenant_id === tenantId, `cross-tenant access denied`,          'TENANT_MISMATCH');
    assert(existing.status === 'OPEN',    `cannot modify ${existing.status} pack`, 'PACK_CLOSED');
    verifyHash(existing);

    return store.appendToField(packId, 'ai_artifacts', {
      ...artifact,
      recorded_at: artifact.recorded_at || nowIso(),
    });
  }

  // ── close ─────────────────────────────────────────────────────────────────────

  async function close(packId, tenantId, closedBy) {
    assert(packId,   'packId is required');
    assert(tenantId, 'tenantId is required');
    assert(closedBy, 'closedBy is required');

    const existing = await store.get(packId);
    assert(existing,                     `pack not found: ${packId}`,             'PACK_NOT_FOUND');
    assert(existing.tenant_id === tenantId, `cross-tenant access denied`,          'TENANT_MISMATCH');
    assert(existing.status === 'OPEN',    `pack is already ${existing.status}`,    'PACK_NOT_OPEN');

    // Verify integrity before close
    verifyHash(existing);

    // Validate all 8 required fields — partial packs cannot be closed
    validateRequiredFields(existing);

    const updated = await store.updateStatus(packId, {
      status:    'CLOSED',
      closed_at: nowIso(),
      closed_by: closedBy,
    });

    return updated;
  }

  // ── get ───────────────────────────────────────────────────────────────────────

  async function get(packId, tenantId, requestingRole) {
    assert(packId,   'packId is required');
    assert(tenantId, 'tenantId is required');

    const pack = await store.get(packId);
    assert(pack, `pack not found: ${packId}`, 'PACK_NOT_FOUND');

    // Tenant isolation enforced — cross-tenant throws
    if (pack.tenant_id !== tenantId) {
      throw evidenceError(`cross-tenant access denied: pack ${packId} belongs to a different tenant`, 'TENANT_MISMATCH');
    }

    // Immutable hash verified on EVERY get() — corrupted pack throws EvidenceIntegrityError
    verifyHash(pack);

    // Return non-destructive redacted view
    return applyRedactionRules(pack, requestingRole || 'VIEWER');
  }

  // ── export ────────────────────────────────────────────────────────────────────

  async function exportPack(packId, tenantId, format, requestingRole) {
    assert(packId,   'packId is required');
    assert(tenantId, 'tenantId is required');
    assert(POLICY.export.supportedFormats.includes(format), `Unsupported export format: ${format}`, 'INVALID_FORMAT');

    const pack = await get(packId, tenantId, requestingRole);  // verifies hash + applies redaction
    assert(pack.status === 'CLOSED', `only CLOSED packs can be exported (current status: ${pack.status})`, 'PACK_NOT_CLOSED');

    const now = nowIso();
    await store.updateStatus(packId, { status: 'EXPORTED', exported_at: now });

    return {
      pack_id:          packId,
      format,
      exported_at:      now,
      data:             pack,  // redacted view
      policy_version:   POLICY.version,
    };
  }

  // ── listByTenant ──────────────────────────────────────────────────────────────

  async function listByTenant(tenantId) {
    assert(tenantId, 'tenantId is required');
    const packs = await store.allByTenant(tenantId);
    // Return summary view — no hash verification on list (integrity checked on individual get())
    return packs.map(p => ({
      pack_id:       p.pack_id,
      pack_type:     p.pack_type,
      tenant_id:     p.tenant_id,
      status:        p.status,
      actor_id:      p.actor?.actor_id   || null,
      actor_role:    p.actor?.actor_role || null,
      action:        p.action,
      timestamp:     p.timestamp,
      created_at:    p.created_at,
      closed_at:     p.closed_at,
      exported_at:   p.exported_at,
      file_count:    (p.attached_files || []).length,
      approval_count:(p.approval_chain || []).length,
    }));
  }

  return {
    create,
    attach,
    addApproval,
    addAiArtifact,
    close,
    get,
    export:       exportPack,
    listByTenant,
    // Exposed for testing
    computeImmutableHash,
    verifyHash,
    validateRequiredFields,
    POLICY,
  };
}

module.exports = {
  createEvidencePackService,
  InMemoryEvidencePackStore,
  computeImmutableHash,
  verifyHash,
  validateRequiredFields,
  POLICY,
};
