'use strict';

const crypto = require('crypto');

const JOB_STATUSES = new Set(['PENDING', 'RUNNING', 'COMPLETED', 'FAILED']);

function randomId() {
  return crypto.randomUUID ? crypto.randomUUID() : crypto.randomBytes(16).toString('hex');
}

function nowIso() { return new Date().toISOString(); }

function domainErr(message, code) {
  return Object.assign(new Error(message), { code });
}

class InMemoryExecutionJobStore {
  constructor() { this.rows = new Map(); }

  async insert(j) { this.rows.set(j.execution_job_id, j); return j; }

  async get(id) { return this.rows.get(id) || null; }

  async list(tenantId, milestoneId) {
    return Array.from(this.rows.values()).filter(j => {
      if (tenantId   && j.tenant_id    !== tenantId)   return false;
      if (milestoneId && j.milestone_id !== milestoneId) return false;
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

function createExecutionJobService({ store, hooks }) {
  if (!store) throw new Error('store is required');

  return {
    async create({ tenant_id, project_id, milestone_id, job_type, actor, correlation_id, causation_id }) {
      if (!job_type || !job_type.trim()) throw domainErr('job_type is required', 'VALIDATION_ERROR');
      if (!project_id) throw domainErr('project_id is required', 'VALIDATION_ERROR');
      if (!milestone_id) throw domainErr('milestone_id is required', 'VALIDATION_ERROR');

      const execution_job_id = randomId();
      const job = {
        execution_job_id,
        tenant_id,
        project_id,
        milestone_id,
        job_type:         job_type.trim(),
        status:           'PENDING',
        artifact_count:   0,
        requires_approval: false,
        created_at:       nowIso(),
        updated_at:       nowIso(),
      };

      await store.insert(job);

      if (hooks && hooks.emitExecutionJobCreated) {
        await hooks.emitExecutionJobCreated({
          event_id:       randomId(),
          tenant_id,
          aggregate_id:   execution_job_id,
          actor:          actor || { actor_type: 'SYSTEM', actor_id: 'wos_core' },
          correlation_id: correlation_id || randomId(),
          causation_id:   causation_id   || randomId(),
          payload: {
            execution_job_id,
            project_id,
            milestone_id,
            job_type:  job.job_type,
            status:    'PENDING',
          },
          metadata: {},
        });
      }

      return job;
    },

    async get(execution_job_id) {
      return store.get(execution_job_id);
    },

    async list(tenant_id, milestone_id) {
      return store.list(tenant_id, milestone_id);
    },

    async complete(execution_job_id, { artifact_count = 0, requires_approval = false, actor, correlation_id, causation_id } = {}) {
      const existing = await store.get(execution_job_id);
      if (!existing) throw domainErr(`ExecutionJob not found: ${execution_job_id}`, 'NOT_FOUND');
      if (existing.status === 'COMPLETED') throw domainErr('Job is already completed', 'PRECONDITION_FAILED');

      const updated = await store.update(execution_job_id, {
        status:           'COMPLETED',
        artifact_count,
        requires_approval,
      });

      if (hooks && hooks.emitExecutionJobCompleted) {
        await hooks.emitExecutionJobCompleted({
          event_id:       randomId(),
          tenant_id:      existing.tenant_id,
          aggregate_id:   execution_job_id,
          actor:          actor || { actor_type: 'SYSTEM', actor_id: 'wos_core' },
          correlation_id: correlation_id || randomId(),
          causation_id:   causation_id   || randomId(),
          payload: {
            execution_job_id,
            project_id:        existing.project_id,
            milestone_id:      existing.milestone_id,
            job_type:          existing.job_type,
            status:            'COMPLETED',
            artifact_count,
            requires_approval,
          },
          metadata: {},
        });
      }

      return updated;
    },

    async fail(execution_job_id) {
      const existing = await store.get(execution_job_id);
      if (!existing) throw domainErr(`ExecutionJob not found: ${execution_job_id}`, 'NOT_FOUND');
      return store.update(execution_job_id, { status: 'FAILED' });
    },
  };
}

module.exports = {
  createExecutionJobService,
  InMemoryExecutionJobStore,
  JOB_STATUSES: [...JOB_STATUSES],
};
