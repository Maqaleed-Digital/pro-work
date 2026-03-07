'use strict';

function assert(condition, message) {
  if (!condition) {
    const err = new Error(message);
    err.name = 'DocumentServiceError';
    throw err;
  }
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

class InMemoryDocumentStore {
  constructor() {
    this.items = new Map();
  }

  async insert(doc) {
    this.items.set(doc.document_id, clone(doc));
    return clone(doc);
  }

  async update(documentId, patch) {
    const existing = this.items.get(documentId);
    assert(existing, `document not found: ${documentId}`);
    const next = { ...existing, ...clone(patch) };
    this.items.set(documentId, next);
    return clone(next);
  }

  async get(documentId) {
    return this.items.has(documentId) ? clone(this.items.get(documentId)) : null;
  }

  async all() {
    return Array.from(this.items.values()).map(clone);
  }
}

function createDocumentService({ store, hooks }) {
  assert(store, 'store is required');
  assert(hooks && typeof hooks.publish === 'function', 'hooks.publish is required');

  return {
    async createDocument(input) {
      assert(input && typeof input === 'object', 'input is required');
      assert(input.document_id, 'document_id is required');
      assert(input.worker_id, 'worker_id is required');
      assert(input.tenant_id, 'tenant_id is required');
      assert(input.document_type, 'document_type is required');

      const doc = {
        document_id: input.document_id,
        tenant_id: input.tenant_id,
        worker_id: input.worker_id,
        onboarding_case_id: input.onboarding_case_id,
        document_type: input.document_type,
        verification_status: 'PENDING',
        file_ref: input.file_ref || null,
        issued_at: input.issued_at || null,
        expires_at: input.expires_at || null,
        created_at: input.created_at,
        updated_at: input.created_at,
      };

      await store.insert(doc);
      return doc;
    },

    async verifyDocument(input) {
      assert(input && typeof input === 'object', 'input is required');
      const updated = await store.update(input.document_id, {
        verification_status: 'VERIFIED',
        verified_by: input.verified_by,
        verified_at: input.verified_at,
        updated_at: input.verified_at,
      });

      await hooks.publish({
        event_id: input.event_id,
        event_type: 'DOCUMENT_VERIFIED',
        event_version: '1.0',
        occurred_at: input.occurred_at,
        tenant_id: updated.tenant_id,
        aggregate_type: 'ONBOARDING_CASE',
        aggregate_id: updated.onboarding_case_id,
        actor: input.actor,
        correlation_id: input.correlation_id,
        causation_id: input.causation_id,
        source: {
          service: 'onboarding',
          module: 'document_service',
          environment: process.env.NODE_ENV || 'development',
        },
        trust_level: 'HIGH',
        requires_approval: true,
        payload: {
          document_id: updated.document_id,
          worker_id: updated.worker_id,
          onboarding_case_id: updated.onboarding_case_id,
          document_type: updated.document_type,
          verification_status: updated.verification_status,
        },
        metadata: input.metadata || {},
      });

      return updated;
    },

    async getDocument(documentId) {
      return store.get(documentId);
    },

    async listDocuments() {
      return store.all();
    },
  };
}

module.exports = {
  createDocumentService,
  InMemoryDocumentStore,
};
