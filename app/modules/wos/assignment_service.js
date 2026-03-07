'use strict';

const crypto = require('crypto');

const ASSIGNMENT_STATES = new Set(['ACTIVE', 'INACTIVE']);

function randomId() {
  return crypto.randomUUID ? crypto.randomUUID() : crypto.randomBytes(16).toString('hex');
}

function nowIso() { return new Date().toISOString(); }

function domainErr(message, code) {
  return Object.assign(new Error(message), { code });
}

class InMemoryAssignmentStore {
  constructor() { this.rows = new Map(); }

  async insert(a) { this.rows.set(a.assignment_id, a); return a; }

  async get(id) { return this.rows.get(id) || null; }

  async list(tenantId) {
    return Array.from(this.rows.values()).filter(a => !tenantId || a.tenant_id === tenantId);
  }

  async update(id, patch) {
    const existing = this.rows.get(id);
    if (!existing) return null;
    const updated = { ...existing, ...patch, updated_at: nowIso() };
    this.rows.set(id, updated);
    return updated;
  }

  async countActiveForPod(pod_id) {
    let count = 0;
    for (const a of this.rows.values()) {
      if (a.pod_id === pod_id && a.state === 'ACTIVE') count++;
    }
    return count;
  }
}

function createAssignmentService({ store, workerService, podService }) {
  if (!store) throw new Error('store is required');

  return {
    async create({ tenant_id, worker_id, pod_id, role = 'member' }) {
      // Verify worker exists and is active
      if (workerService) {
        const worker = await workerService.get(worker_id);
        if (!worker) throw domainErr(`Worker not found: ${worker_id}`, 'NOT_FOUND');
        if (worker.status !== 'ACTIVE') throw domainErr('Worker must be ACTIVE to be assigned', 'PRECONDITION_FAILED');
        if (worker.assigned_pod) throw domainErr(`Worker ${worker_id} is already assigned`, 'ALREADY_ASSIGNED');
      }

      // Verify pod exists and is active, check capacity
      if (podService) {
        const pod = await podService.get(pod_id);
        if (!pod) throw domainErr(`Pod not found: ${pod_id}`, 'NOT_FOUND');
        if (pod.state !== 'ACTIVE') throw domainErr('Pod must be ACTIVE', 'PRECONDITION_FAILED');
        const activeCount = await store.countActiveForPod(pod_id);
        if (activeCount >= pod.capacity.max_workers) {
          throw domainErr(`Pod ${pod_id} is at capacity (${pod.capacity.max_workers})`, 'CAPACITY_EXCEEDED');
        }
      }

      const assignment_id = randomId();
      const assignment = {
        assignment_id,
        tenant_id,
        worker_id,
        pod_id,
        role,
        state:      'ACTIVE',
        created_at: nowIso(),
        updated_at: nowIso(),
      };

      await store.insert(assignment);

      // Side-effect: update worker's assigned_pod
      if (workerService) {
        await workerService.assignPod(worker_id, { pod_id, role, assignment_id });
      }

      return assignment;
    },

    async get(assignment_id) {
      return store.get(assignment_id);
    },

    async list(tenant_id) {
      return store.list(tenant_id);
    },

    async deactivate(assignment_id) {
      const existing = await store.get(assignment_id);
      if (!existing) throw domainErr(`Assignment not found: ${assignment_id}`, 'NOT_FOUND');
      if (existing.state === 'INACTIVE') throw domainErr('Assignment is already inactive', 'PRECONDITION_FAILED');

      const updated = await store.update(assignment_id, { state: 'INACTIVE' });

      // Side-effect: unassign worker
      if (workerService) {
        await workerService.unassignPod(existing.worker_id).catch(() => {});
      }

      return updated;
    },
  };
}

module.exports = {
  createAssignmentService,
  InMemoryAssignmentStore,
  ASSIGNMENT_STATES: [...ASSIGNMENT_STATES],
};
