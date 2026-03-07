'use strict';

const crypto = require('crypto');
const { getSchema } = require('../event_bus/schema_registry');
const { computePayloadDigest, computeLedgerEntryHash } = require('./ledger_hash');

function randomId() {
  if (crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return crypto.randomBytes(16).toString('hex');
}

function createTrustConsumer({ ledgerStore }) {
  if (!ledgerStore || typeof ledgerStore.getLastHash !== 'function' || typeof ledgerStore.append !== 'function') {
    throw new Error('ledgerStore with getLastHash() and append(entry) is required');
  }

  const TRUST_SENSITIVE_EVENT_TYPES = new Set([
    'DELIVERABLE_APPROVED',
    'AGENT_JOB_COMPLETED',
    'PHR_REVIEW_APPROVED',
    'MILESTONE_COMPLETED',
    'EVIDENCE_PACK_GENERATED',
    'TRUST_LEDGER_APPENDED',
    'TOKEN_ISSUED',
  ]);

  return {
    async process(event) {
      const schema = getSchema(event.event_type);
      if (!schema) {
        throw new Error(`Unregistered event type: ${event.event_type}`);
      }

      const shouldLedger =
        schema.trust_sensitive ||
        TRUST_SENSITIVE_EVENT_TYPES.has(event.event_type) ||
        ['HIGH', 'CRITICAL'].includes(event.trust_level);

      if (!shouldLedger) {
        return { processed: false, reason: 'not_trust_sensitive' };
      }

      const prev_hash = await ledgerStore.getLastHash();
      const payload_digest = computePayloadDigest(event.payload);
      const ledger_entry_id = randomId();
      const entry_hash = computeLedgerEntryHash({
        event_id: event.event_id,
        event_type: event.event_type,
        aggregate_id: event.aggregate_id,
        payload_digest,
        prev_hash,
      });

      const ledgerEntry = {
        ledger_entry_id,
        event_id: event.event_id,
        tenant_id: event.tenant_id,
        aggregate_type: event.aggregate_type,
        aggregate_id: event.aggregate_id,
        action_type: event.event_type,
        trust_level: event.trust_level,
        payload_digest,
        prev_hash,
        entry_hash,
        evidence_pack_id: event.payload.evidence_pack_id || null,
        occurred_at: event.occurred_at,
        created_at: new Date().toISOString(),
      };

      await ledgerStore.append(ledgerEntry);

      return {
        processed: true,
        ledger_entry_id,
        entry_hash,
        prev_hash,
        payload_digest,
      };
    },
  };
}

class InMemoryLedgerStore {
  constructor() {
    this.entries = [];
  }

  async getLastHash() {
    if (this.entries.length === 0) {
      return null;
    }
    return this.entries[this.entries.length - 1].entry_hash;
  }

  async append(entry) {
    this.entries.push(entry);
    return entry;
  }

  async all() {
    return [...this.entries];
  }
}

module.exports = {
  createTrustConsumer,
  InMemoryLedgerStore,
};
