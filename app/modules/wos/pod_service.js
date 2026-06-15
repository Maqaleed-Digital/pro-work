'use strict';

const crypto = require('crypto');

const POD_STATES = new Set(['ACTIVE', 'INACTIVE']);

function randomId() {
  return crypto.randomUUID ? crypto.randomUUID() : crypto.randomBytes(16).toString('hex');
}

function nowIso() { return new Date().toISOString(); }

function domainErr(message, code) {
  return Object.assign(new Error(message), { code });
}

class InMemoryPodStore {
  constructor() { this.rows = new Map(); }

  async insert(p) { this.rows.set(p.pod_id, p); return p; }

  async get(id) { return this.rows.get(id) || null; }

  async list(tenantId) {
    return Array.from(this.rows.values()).filter(p => !tenantId || p.tenant_id === tenantId);
  }

  async update(id, patch) {
    const existing = this.rows.get(id);
    if (!existing) return null;
    const updated = { ...existing, ...patch, updated_at: nowIso() };
    this.rows.set(id, updated);
    return updated;
  }
}

function createPodService({ store }) {
  if (!store) throw new Error('store is required');

  return {
    async create({ tenant_id, name, capacity = { max_workers: 10 }, roles = ['member'] }) {
      if (!name || !name.trim()) throw domainErr('name is required', 'VALIDATION_ERROR');
      const max = capacity && Number.isFinite(capacity.max_workers) ? capacity.max_workers : 10;
      if (max < 1) throw domainErr('capacity.max_workers must be >= 1', 'VALIDATION_ERROR');

      const pod = {
        pod_id:     randomId(),
        tenant_id,
        name:       name.trim(),
        state:      'ACTIVE',
        capacity:   { max_workers: max },
        roles:      Array.isArray(roles) ? roles.slice() : ['member'],
        created_at: nowIso(),
        updated_at: nowIso(),
      };

      await store.insert(pod);
      return pod;
    },

    async get(pod_id) {
      return store.get(pod_id);
    },

    async list(tenant_id) {
      return store.list(tenant_id);
    },

    async setState(pod_id, state) {
      if (!POD_STATES.has(state)) throw domainErr(`Invalid state: ${state}`, 'INVALID_STATE');
      const existing = await store.get(pod_id);
      if (!existing) throw domainErr(`Pod not found: ${pod_id}`, 'NOT_FOUND');
      return store.update(pod_id, { state });
    },
  };
}

module.exports = {
  createPodService,
  InMemoryPodStore,
  POD_STATES: [...POD_STATES],
};
