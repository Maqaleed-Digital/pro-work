'use strict';

// S36-G1: AI Governance — RecommendationAuditLog service
// BRD Refs: Gold BRD A4, WOS §11.3, RT-1 §8.2
//
// Constraints:
// - append-only: write() only — no update or delete methods exposed
// - immutableHash: SHA-256 of all fields except immutable_hash itself, verified on every read
// - tenant isolation: tenant_id required on every write and enforced on every read
// - bias monitoring: integrated, never blocks — logs and flags only

const { randomUUID } = require('crypto');
const crypto = require('crypto');
const { computeBiasScore } = require('./bias_monitor');

// Valid action types
const ACTION_TYPES = ['RECOMMENDATION', 'MATCH', 'COMPLIANCE_HINT', 'SUMMARY', 'RISK_SCORE'];

// Valid reviewer decisions
const REVIEWER_DECISIONS = ['ACCEPTED', 'REJECTED', 'OVERRIDDEN', 'PENDING'];

class AuditLogServiceError extends Error {
  constructor(message) {
    super(message);
    this.name = 'AuditLogServiceError';
  }
}

class ImmutableHashError extends Error {
  constructor(id) {
    super(`Immutable hash verification failed for entry: ${id}`);
    this.name = 'ImmutableHashError';
  }
}

/**
 * Compute the immutable hash for an audit log entry.
 * Hash is SHA-256 of a deterministic canonical serialisation of all fields
 * except immutable_hash itself.
 *
 * @param {Object} entry - all fields of the log entry excluding immutable_hash
 * @returns {string} hex SHA-256 digest
 */
function computeImmutableHash(entry) {
  const fields = { ...entry };
  delete fields.immutable_hash;

  // Deterministic canonical serialisation: sort keys recursively
  const canonical = canonicalStringify(fields);
  return crypto.createHash('sha256').update(canonical).digest('hex');
}

function canonicalStringify(value) {
  if (Array.isArray(value)) {
    return `[${value.map(canonicalStringify).join(',')}]`;
  }
  if (value !== null && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((k) => `${JSON.stringify(k)}:${canonicalStringify(value[k])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

/**
 * Compute SHA-256 of a string — used for prompt_hash.
 * @param {string} input
 * @returns {string}
 */
function sha256(input) {
  return crypto.createHash('sha256').update(String(input)).digest('hex');
}

function assert(condition, message) {
  if (!condition) throw new AuditLogServiceError(message);
}

/**
 * In-memory append-only store.
 * Production: replace with DB adapter that enforces append-only at DB level
 * (migration revokes UPDATE/DELETE from application role).
 */
class InMemoryAuditLogStore {
  constructor() {
    this._entries = new Map();
  }

  async insert(entry) {
    if (this._entries.has(entry.id)) {
      throw new AuditLogServiceError(`Duplicate audit log entry: ${entry.id}`);
    }
    // Freeze a deep copy — immutability enforced in memory too
    const stored = Object.freeze(JSON.parse(JSON.stringify(entry)));
    this._entries.set(entry.id, stored);
    return JSON.parse(JSON.stringify(stored));
  }

  async getById(id) {
    const entry = this._entries.get(id);
    return entry ? JSON.parse(JSON.stringify(entry)) : null;
  }

  async queryByTenant(tenantId, { limit = 25, offset = 0, reviewerDecision } = {}) {
    let results = Array.from(this._entries.values())
      .filter((e) => e.tenant_id === tenantId);

    if (reviewerDecision) {
      results = results.filter((e) => e.reviewer_decision === reviewerDecision);
    }

    // Newest first
    results.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

    return results.slice(offset, offset + limit).map((e) => JSON.parse(JSON.stringify(e)));
  }

  async all() {
    return Array.from(this._entries.values()).map((e) => JSON.parse(JSON.stringify(e)));
  }
}

/**
 * Create an AuditLogService instance.
 *
 * @param {{ store: Object }} deps
 *   store: object with insert(entry), getById(id), queryByTenant(tenantId, opts) methods
 */
function createAuditLogService({ store }) {
  assert(store, 'store is required');
  assert(typeof store.insert === 'function', 'store.insert must be a function');
  assert(typeof store.getById === 'function', 'store.getById must be a function');
  assert(typeof store.queryByTenant === 'function', 'store.queryByTenant must be a function');

  /**
   * Write an AI recommendation audit log entry.
   * Append-only — no update or delete path exists.
   *
   * @param {Object} input
   * @returns {Promise<Object>} the stored entry including immutable_hash
   */
  async function write(input) {
    assert(input, 'input is required');
    assert(input.tenant_id, 'tenant_id is required');
    assert(input.actor, 'actor is required');
    assert(ACTION_TYPES.includes(input.action_type), `action_type must be one of: ${ACTION_TYPES.join(', ')}`);
    assert(typeof input.confidence_score === 'number', 'confidence_score must be a number');
    assert(input.confidence_score >= 0 && input.confidence_score <= 1, 'confidence_score must be between 0.00 and 1.00');
    assert(input.model_version, 'model_version is required');
    assert(input.output_snapshot !== undefined && input.output_snapshot !== null, 'output_snapshot is required');

    // Run bias monitor — never throws, never blocks
    const biasResult = computeBiasScore(input.input_signals || {});

    const id        = input.id || randomUUID();
    const timestamp = input.timestamp || new Date().toISOString();
    const promptHash = input.prompt_hash || sha256(JSON.stringify(input.input_signals || {}));

    const entryWithoutHash = {
      id,
      timestamp,
      actor:             input.actor,
      action_type:       input.action_type,
      input_signals:     input.input_signals     || {},
      rationale:         input.rationale         || null,
      confidence_score:  parseFloat(input.confidence_score.toFixed(2)),
      model_version:     input.model_version,
      prompt_hash:       promptHash,
      output_snapshot:   input.output_snapshot,
      reviewer_decision: 'PENDING',
      reviewer_id:       null,
      reviewed_at:       null,
      override_reason:   null,
      bias_score:        parseFloat(biasResult.biasScore.toFixed(2)),
      bias_flagged:      biasResult.flagged,
      bias_sensitive_signals: biasResult.sensitiveSignals,
      bias_primary_drivers:   biasResult.primaryDrivers,
      tenant_id:         input.tenant_id,
    };

    const immutableHash = computeImmutableHash(entryWithoutHash);
    const entry = { ...entryWithoutHash, immutable_hash: immutableHash };

    return store.insert(entry);
  }

  /**
   * Read a single audit log entry and verify its immutable hash.
   * Throws ImmutableHashError if the hash does not match stored fields.
   *
   * @param {string} id
   * @param {string} tenantId - required for tenant isolation
   * @returns {Promise<Object>}
   */
  async function get(id, tenantId) {
    assert(id, 'id is required');
    assert(tenantId, 'tenantId is required');

    const entry = await store.getById(id);
    assert(entry, `audit log entry not found: ${id}`);
    assert(entry.tenant_id === tenantId, 'tenant isolation violation');

    // Verify immutable hash on every read
    const expected = computeImmutableHash(entry);
    if (entry.immutable_hash !== expected) {
      throw new ImmutableHashError(id);
    }

    return entry;
  }

  /**
   * Query audit log entries for a tenant.
   * All entries have their immutable hash verified before being returned.
   *
   * @param {string} tenantId
   * @param {{ limit?: number, offset?: number, reviewerDecision?: string }} opts
   * @returns {Promise<Object[]>}
   */
  async function query(tenantId, opts = {}) {
    assert(tenantId, 'tenantId is required');

    const entries = await store.queryByTenant(tenantId, opts);

    // Verify each entry's immutable hash
    for (const entry of entries) {
      const expected = computeImmutableHash(entry);
      if (entry.immutable_hash !== expected) {
        throw new ImmutableHashError(entry.id);
      }
    }

    return entries;
  }

  /**
   * Export all audit log entries for a tenant as structured JSON.
   * Suitable for regulator download.
   *
   * @param {string} tenantId
   * @returns {Promise<Object>}
   */
  async function exportForRegulator(tenantId) {
    assert(tenantId, 'tenantId is required');

    const entries = await query(tenantId, { limit: 10000 });

    return {
      export_version: '1.0',
      exported_at:    new Date().toISOString(),
      tenant_id:      tenantId,
      total_entries:  entries.length,
      entries,
    };
  }

  return { write, get, query, exportForRegulator };
}

module.exports = {
  createAuditLogService,
  InMemoryAuditLogStore,
  computeImmutableHash,
  sha256,
  ACTION_TYPES,
  REVIEWER_DECISIONS,
  AuditLogServiceError,
  ImmutableHashError,
};
