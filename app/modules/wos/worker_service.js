'use strict';

const crypto = require('crypto');

const WORKER_TYPES = new Set(['FTE', 'FREELANCER']);
const WORKER_STATUSES = new Set(['ACTIVE', 'INACTIVE', 'SUSPENDED']);

// Status transition allowlist
const ALLOWED_TRANSITIONS = {
  ACTIVE:    new Set(['INACTIVE', 'SUSPENDED']),
  INACTIVE:  new Set(['ACTIVE']),
  SUSPENDED: new Set(['ACTIVE']),
};

function randomId() {
  return crypto.randomUUID ? crypto.randomUUID() : crypto.randomBytes(16).toString('hex');
}

function nowIso() { return new Date().toISOString(); }

function domainErr(message, code) {
  return Object.assign(new Error(message), { code });
}

class InMemoryWorkerStore {
  constructor() { this.rows = new Map(); }

  async insert(w) { this.rows.set(w.worker_id, w); return w; }

  async get(id) { return this.rows.get(id) || null; }

  async list(tenantId) {
    return Array.from(this.rows.values()).filter(w => !tenantId || w.tenant_id === tenantId);
  }

  async update(id, patch) {
    const existing = this.rows.get(id);
    if (!existing) return null;
    const updated = { ...existing, ...patch, updated_at: nowIso() };
    this.rows.set(id, updated);
    return updated;
  }
}

function createWorkerService({ store }) {
  if (!store) throw new Error('store is required');

  return {
    async create({ tenant_id, type, display_name, email = null, skills = [], availability = {} }) {
      if (!WORKER_TYPES.has(type)) throw domainErr(`Invalid worker type: ${type}`, 'INVALID_TYPE');
      if (!display_name || !display_name.trim()) throw domainErr('display_name is required', 'VALIDATION_ERROR');
      if (!Array.isArray(skills)) throw domainErr('skills must be an array', 'VALIDATION_ERROR');

      const worker = {
        worker_id:    randomId(),
        tenant_id,
        type,
        display_name: display_name.trim(),
        email:        email || null,
        skills:       skills.slice(),
        availability: { ...availability },
        status:       'ACTIVE',
        assigned_pod: null,
        created_at:   nowIso(),
        updated_at:   nowIso(),
      };

      await store.insert(worker);
      return worker;
    },

    async get(worker_id) {
      return store.get(worker_id);
    },

    async list(tenant_id) {
      return store.list(tenant_id);
    },

    async setStatus(worker_id, status) {
      if (!WORKER_STATUSES.has(status)) throw domainErr(`Invalid status: ${status}`, 'INVALID_STATUS');
      const existing = await store.get(worker_id);
      if (!existing) throw domainErr(`Worker not found: ${worker_id}`, 'NOT_FOUND');
      const allowed = ALLOWED_TRANSITIONS[existing.status];
      if (!allowed.has(status)) {
        throw domainErr(`Transition ${existing.status} → ${status} not allowed`, 'INVALID_TRANSITION');
      }
      return store.update(worker_id, { status });
    },

    async assignPod(worker_id, { pod_id, role, assignment_id }) {
      const existing = await store.get(worker_id);
      if (!existing) throw domainErr(`Worker not found: ${worker_id}`, 'NOT_FOUND');
      return store.update(worker_id, { assigned_pod: { pod_id, role, assignment_id } });
    },

    async unassignPod(worker_id) {
      const existing = await store.get(worker_id);
      if (!existing) throw domainErr(`Worker not found: ${worker_id}`, 'NOT_FOUND');
      return store.update(worker_id, { assigned_pod: null });
    },

    async patch(worker_id, patch) {
      const existing = await store.get(worker_id);
      if (!existing) throw domainErr(`Worker not found: ${worker_id}`, 'NOT_FOUND');
      const allowed = ['display_name', 'email', 'skills', 'availability'];
      const clean = {};
      for (const k of allowed) {
        if (patch[k] !== undefined) clean[k] = patch[k];
      }
      return store.update(worker_id, clean);
    },
  };
}

module.exports = {
  createWorkerService,
  InMemoryWorkerStore,
  WORKER_TYPES: [...WORKER_TYPES],
  WORKER_STATUSES: [...WORKER_STATUSES],
};
