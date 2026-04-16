'use strict';

const crypto = require('crypto');

const MILESTONE_STATUSES = new Set(['OPEN', 'IN_PROGRESS', 'COMPLETED']);

const ALLOWED_TRANSITIONS = {
  OPEN:        new Set(['IN_PROGRESS']),
  IN_PROGRESS: new Set(['COMPLETED']),
  COMPLETED:   new Set(),
};

function randomId() {
  return crypto.randomUUID ? crypto.randomUUID() : crypto.randomBytes(16).toString('hex');
}

function nowIso() { return new Date().toISOString(); }

function domainErr(message, code) {
  return Object.assign(new Error(message), { code });
}

class InMemoryMilestoneStore {
  constructor() { this.rows = new Map(); }

  async insert(m) { this.rows.set(m.milestone_id, m); return m; }

  async get(id) { return this.rows.get(id) || null; }

  async list(tenantId, workstreamId) {
    return Array.from(this.rows.values()).filter(m => {
      if (tenantId && m.tenant_id !== tenantId) return false;
      if (workstreamId && m.workstream_id !== workstreamId) return false;
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

function createMilestoneService({ store, hooks }) {
  if (!store) throw new Error('store is required');

  return {
    async create({ tenant_id, workstream_id, project_id, title, description = null, created_by, actor, correlation_id, causation_id }) {
      if (!title || !title.trim()) throw domainErr('title is required', 'VALIDATION_ERROR');
      if (!workstream_id) throw domainErr('workstream_id is required', 'VALIDATION_ERROR');
      if (!project_id) throw domainErr('project_id is required', 'VALIDATION_ERROR');
      if (!created_by) throw domainErr('created_by is required', 'VALIDATION_ERROR');

      const milestone_id = randomId();
      const milestone = {
        milestone_id,
        tenant_id,
        workstream_id,
        project_id,
        title:        title.trim(),
        description:  description || null,
        status:       'OPEN',
        created_by,
        completed_at: null,
        created_at:   nowIso(),
        updated_at:   nowIso(),
      };

      await store.insert(milestone);

      if (hooks && hooks.emitMilestoneCreated) {
        await hooks.emitMilestoneCreated({
          event_id:       randomId(),
          tenant_id,
          aggregate_id:   milestone_id,
          actor:          actor || { actor_type: 'SYSTEM', actor_id: 'wos_core' },
          correlation_id: correlation_id || randomId(),
          causation_id:   causation_id   || randomId(),
          payload: {
            milestone_id,
            workstream_id,
            project_id,
            created_by,
          },
          metadata: { title: milestone.title, description: milestone.description },
        });
      }

      return milestone;
    },

    async get(milestone_id) {
      return store.get(milestone_id);
    },

    async list(tenant_id, workstream_id) {
      return store.list(tenant_id, workstream_id);
    },

    async advance(milestone_id, { actor, correlation_id, causation_id } = {}) {
      const existing = await store.get(milestone_id);
      if (!existing) throw domainErr(`Milestone not found: ${milestone_id}`, 'NOT_FOUND');
      const allowed = ALLOWED_TRANSITIONS[existing.status];
      if (allowed.size === 0) throw domainErr(`Milestone ${milestone_id} is already ${existing.status}`, 'PRECONDITION_FAILED');
      const [nextStatus] = [...allowed];
      return this._transition(milestone_id, nextStatus, { actor, correlation_id, causation_id });
    },

    async complete(milestone_id, { approval_record_id, evidence_pack_id, completed_by_actor_type, completed_by_actor_id, actor, correlation_id, causation_id } = {}) {
      const existing = await store.get(milestone_id);
      if (!existing) throw domainErr(`Milestone not found: ${milestone_id}`, 'NOT_FOUND');
      if (existing.status === 'COMPLETED') throw domainErr('Milestone is already completed', 'PRECONDITION_FAILED');

      const completed_at = nowIso();
      const updated = await store.update(milestone_id, { status: 'COMPLETED', completed_at });

      // MILESTONE_COMPLETED is trust-sensitive → goes to ledger
      if (hooks && hooks.emitMilestoneCompleted) {
        await hooks.emitMilestoneCompleted({
          event_id:       randomId(),
          tenant_id:      existing.tenant_id,
          aggregate_id:   milestone_id,
          actor:          actor || { actor_type: 'SYSTEM', actor_id: 'wos_core' },
          correlation_id: correlation_id || randomId(),
          causation_id:   causation_id   || randomId(),
          payload: {
            milestone_id,
            workstream_id:           existing.workstream_id,
            project_id:              existing.project_id,
            completed_by_actor_type: completed_by_actor_type || 'SYSTEM',
            completed_by_actor_id:   completed_by_actor_id   || 'wos_core',
            approval_record_id:      approval_record_id      || null,
            evidence_pack_id:        evidence_pack_id        || null,
          },
          metadata: { title: existing.title, completed_at },
        });
      }

      return updated;
    },

    async _transition(milestone_id, status, { actor, correlation_id, causation_id } = {}) {
      if (!MILESTONE_STATUSES.has(status)) throw domainErr(`Invalid status: ${status}`, 'INVALID_STATUS');
      const existing = await store.get(milestone_id);
      if (!existing) throw domainErr(`Milestone not found: ${milestone_id}`, 'NOT_FOUND');
      const allowed = ALLOWED_TRANSITIONS[existing.status];
      if (!allowed.has(status)) throw domainErr(`Transition ${existing.status} → ${status} not allowed`, 'INVALID_TRANSITION');

      const patch = { status };
      if (status === 'IN_PROGRESS') {
        const event_id = randomId();
        if (hooks && hooks.emitMilestoneCreated) {
          // no separate IN_PROGRESS event in Phase 1 catalog — silent transition
        }
      }
      return store.update(milestone_id, patch);
    },
  };
}

module.exports = {
  createMilestoneService,
  InMemoryMilestoneStore,
  MILESTONE_STATUSES: [...MILESTONE_STATUSES],
};
