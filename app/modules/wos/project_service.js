'use strict';

const crypto = require('crypto');

const PROJECT_STATUSES = new Set(['DISCUSSION', 'ACTIVE', 'COMPLETED', 'ARCHIVED']);

const ALLOWED_TRANSITIONS = {
  DISCUSSION: new Set(['ACTIVE', 'ARCHIVED']),
  ACTIVE:     new Set(['COMPLETED', 'ARCHIVED']),
  COMPLETED:  new Set(['ARCHIVED']),
  ARCHIVED:   new Set(),
};

function randomId() {
  return crypto.randomUUID ? crypto.randomUUID() : crypto.randomBytes(16).toString('hex');
}

function nowIso() { return new Date().toISOString(); }

function domainErr(message, code) {
  return Object.assign(new Error(message), { code });
}

class InMemoryProjectStore {
  constructor() { this.rows = new Map(); }

  async insert(p) { this.rows.set(p.project_id, p); return p; }

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

function createProjectService({ store, hooks }) {
  if (!store) throw new Error('store is required');

  return {
    async create({ tenant_id, owner_user_id, title, description = null, actor, correlation_id, causation_id }) {
      if (!title || !title.trim()) throw domainErr('title is required', 'VALIDATION_ERROR');
      if (!owner_user_id) throw domainErr('owner_user_id is required', 'VALIDATION_ERROR');

      const project_id = randomId();
      const project = {
        project_id,
        tenant_id,
        owner_user_id,
        title:       title.trim(),
        description: description || null,
        status:      'DISCUSSION',
        created_at:  nowIso(),
        updated_at:  nowIso(),
      };

      await store.insert(project);

      if (hooks && hooks.emitProjectCreated) {
        await hooks.emitProjectCreated({
          event_id:       randomId(),
          tenant_id,
          aggregate_id:   project_id,
          actor:          actor || { actor_type: 'SYSTEM', actor_id: 'wos_core' },
          correlation_id: correlation_id || randomId(),
          causation_id:   causation_id   || randomId(),
          payload: {
            project_id,
            owner_user_id,
            title:  project.title,
            status: 'DISCUSSION',
          },
          metadata: { description: project.description },
        });
      }

      return project;
    },

    async get(project_id) {
      return store.get(project_id);
    },

    async list(tenant_id) {
      return store.list(tenant_id);
    },

    async setStatus(project_id, status, { actor, correlation_id, causation_id } = {}) {
      if (!PROJECT_STATUSES.has(status)) throw domainErr(`Invalid status: ${status}`, 'INVALID_STATUS');
      const existing = await store.get(project_id);
      if (!existing) throw domainErr(`Project not found: ${project_id}`, 'NOT_FOUND');
      const allowed = ALLOWED_TRANSITIONS[existing.status];
      if (!allowed.has(status)) {
        throw domainErr(`Transition ${existing.status} → ${status} not allowed`, 'INVALID_TRANSITION');
      }
      return store.update(project_id, { status });
    },
  };
}

module.exports = {
  createProjectService,
  InMemoryProjectStore,
  PROJECT_STATUSES: [...PROJECT_STATUSES],
};
