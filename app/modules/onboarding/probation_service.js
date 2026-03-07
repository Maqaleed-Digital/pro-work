'use strict';

function assert(condition, message) {
  if (!condition) {
    const err = new Error(message);
    err.name = 'ProbationServiceError';
    throw err;
  }
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

class InMemoryProbationStore {
  constructor() {
    this.cases = new Map();
  }

  async insert(item) {
    this.cases.set(item.probation_case_id, clone(item));
    return clone(item);
  }

  async update(id, patch) {
    const existing = this.cases.get(id);
    assert(existing, `probation case not found: ${id}`);
    const next = { ...existing, ...clone(patch) };
    this.cases.set(id, next);
    return clone(next);
  }

  async get(id) {
    return this.cases.has(id) ? clone(this.cases.get(id)) : null;
  }
}

function createProbationService({ store, hooks }) {
  assert(store, 'store is required');
  assert(hooks && typeof hooks.publish === 'function', 'hooks.publish is required');

  return {
    async openProbationCase(input) {
      assert(input.probation_case_id, 'probation_case_id is required');
      const item = {
        probation_case_id: input.probation_case_id,
        tenant_id: input.tenant_id,
        worker_id: input.worker_id,
        onboarding_case_id: input.onboarding_case_id,
        probation_days: input.probation_days || 90,
        status: 'ACTIVE',
        started_at: input.started_at,
        decision_status: 'PENDING',
      };
      await store.insert(item);
      return item;
    },

    async generateDay80Pack(input) {
      const current = await store.get(input.probation_case_id);
      assert(current, `probation case not found: ${input.probation_case_id}`);

      const updated = await store.update(input.probation_case_id, {
        day80_pack_generated_at: input.generated_at,
        evidence_summary: {
          task_completion_count: input.task_completion_count || 0,
          manager_review_count:  input.manager_review_count  || 0,
          policy_ack_count:      input.policy_ack_count      || 0,
          attendance_signal_count: input.attendance_signal_count || 0,
        },
      });

      await hooks.publish({
        event_id: input.event_id,
        event_type: 'PROBATION_PACK_GENERATED',
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
          module: 'probation_service',
          environment: process.env.NODE_ENV || 'development',
        },
        trust_level: 'HIGH',
        requires_approval: true,
        payload: {
          probation_case_id: updated.probation_case_id,
          worker_id: updated.worker_id,
          onboarding_case_id: updated.onboarding_case_id,
          task_completion_count: updated.evidence_summary.task_completion_count,
          manager_review_count:  updated.evidence_summary.manager_review_count,
        },
        metadata: input.metadata || {},
      });

      return updated;
    },

    async recordDecision(input) {
      const current = await store.get(input.probation_case_id);
      assert(current, `probation case not found: ${input.probation_case_id}`);
      assert(
        ['CONFIRM', 'EXTEND', 'TERMINATE'].includes(input.decision),
        'decision must be CONFIRM EXTEND or TERMINATE',
      );

      const updated = await store.update(input.probation_case_id, {
        decision_status: input.decision,
        decision_reason_code: input.reason_code,
        decision_at: input.decision_at,
        extension_days: input.extension_days || 0,
      });

      await hooks.publish({
        event_id: input.event_id,
        event_type: 'PROBATION_DECISION_RECORDED',
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
          module: 'probation_service',
          environment: process.env.NODE_ENV || 'development',
        },
        trust_level: 'HIGH',
        requires_approval: true,
        payload: {
          probation_case_id: updated.probation_case_id,
          worker_id: updated.worker_id,
          onboarding_case_id: updated.onboarding_case_id,
          decision: input.decision,
          reason_code: input.reason_code,
          extension_days: input.extension_days || 0,
        },
        metadata: input.metadata || {},
      });

      return updated;
    },
  };
}

module.exports = {
  createProbationService,
  InMemoryProbationStore,
};
