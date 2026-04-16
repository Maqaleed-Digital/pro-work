'use strict';

const crypto = require('crypto');

const WORKSTREAM_STATUSES = new Set(['ACTIVE', 'PAUSED', 'COMPLETED']);

function randomId() {
  return crypto.randomUUID ? crypto.randomUUID() : crypto.randomBytes(16).toString('hex');
}

function nowIso() { return new Date().toISOString(); }

function domainErr(message, code) {
  return Object.assign(new Error(message), { code });
}

class InMemoryWorkstreamStore {
  constructor() { this.rows = new Map(); }

  async insert(ws) { this.rows.set(ws.workstream_id, ws); return ws; }

  async get(id) { return this.rows.get(id) || null; }

  async list(tenantId, projectId) {
    return Array.from(this.rows.values()).filter(ws => {
      if (tenantId && ws.tenant_id !== tenantId) return false;
      if (projectId && ws.project_id !== projectId) return false;
      return true;
    });
  }

  async update(id, patch) {
    const existing = this.rows.get(id);
    if (!existing) return null;
    const updated = { ...existing, ...patch, updated_at: nowIso() };
    this.rows.set(id, updated);
    return updated;
  }
}

function createWorkstreamService({ store, hooks, projectService }) {
  if (!store) throw new Error('store is required');

  return {
    async create({ tenant_id, project_id, stream_name, description = null, created_by, actor, correlation_id, causation_id }) {
      if (!stream_name || !stream_name.trim()) throw domainErr('stream_name is required', 'VALIDATION_ERROR');
      if (!project_id) throw domainErr('project_id is required', 'VALIDATION_ERROR');
      if (!created_by) throw domainErr('created_by is required', 'VALIDATION_ERROR');

      if (projectService) {
        const project = await projectService.get(project_id);
        if (!project) throw domainErr(`Project not found: ${project_id}`, 'NOT_FOUND');
        if (!['DISCUSSION', 'ACTIVE'].includes(project.status)) {
          throw domainErr(`Project ${project_id} is not open for new workstreams`, 'PRECONDITION_FAILED');
        }
      }

      const workstream_id = randomId();
      const workstream = {
        workstream_id,
        tenant_id,
        project_id,
        stream_name:  stream_name.trim(),
        description:  description || null,
        status:       'ACTIVE',
        created_by,
        created_at:   nowIso(),
        updated_at:   nowIso(),
      };

      await store.insert(workstream);

      if (hooks && hooks.emitWorkstreamCreated) {
        await hooks.emitWorkstreamCreated({
          event_id:       randomId(),
          tenant_id,
          aggregate_id:   workstream_id,
          actor:          actor || { actor_type: 'SYSTEM', actor_id: 'wos_core' },
          correlation_id: correlation_id || randomId(),
          causation_id:   causation_id   || randomId(),
          payload: {
            workstream_id,
            project_id,
            stream_name: workstream.stream_name,
            created_by,
          },
          metadata: { description: workstream.description },
        });
      }

      return workstream;
    },

    async get(workstream_id) {
      return store.get(workstream_id);
    },

    async list(tenant_id, project_id) {
      return store.list(tenant_id, project_id);
    },

    async setStatus(workstream_id, status) {
      if (!WORKSTREAM_STATUSES.has(status)) throw domainErr(`Invalid status: ${status}`, 'INVALID_STATUS');
      const existing = await store.get(workstream_id);
      if (!existing) throw domainErr(`Workstream not found: ${workstream_id}`, 'NOT_FOUND');
      return store.update(workstream_id, { status });
    },
  };
}

module.exports = {
  createWorkstreamService,
  InMemoryWorkstreamStore,
  WORKSTREAM_STATUSES: [...WORKSTREAM_STATUSES],
};
