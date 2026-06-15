'use strict';

function assert(condition, message) {
  if (!condition) {
    const err = new Error(message);
    err.name = 'ComplianceServiceError';
    throw err;
  }
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

class InMemoryComplianceStore {
  constructor() {
    this.items = new Map();
  }

  async upsert(key, value) {
    this.items.set(key, clone(value));
    return clone(value);
  }

  async get(key) {
    return this.items.has(key) ? clone(this.items.get(key)) : null;
  }
}

function validateIban(iban) {
  return typeof iban === 'string' && iban.replace(/\s+/g, '').length >= 15;
}

function createComplianceService({ store, hooks }) {
  assert(store, 'store is required');
  assert(hooks && typeof hooks.publish === 'function', 'hooks.publish is required');

  return {
    async captureIban(input) {
      assert(input.worker_id, 'worker_id is required');
      assert(validateIban(input.iban), 'valid iban is required');

      const row = await store.upsert(`iban:${input.worker_id}`, {
        worker_id: input.worker_id,
        onboarding_case_id: input.onboarding_case_id,
        iban: input.iban,
        bank_confirmation_status: input.bank_confirmation_status || 'PENDING',
        updated_at: input.updated_at,
      });

      await hooks.publish({
        event_id: input.event_id,
        event_type: 'IBAN_CAPTURED',
        event_version: '1.0',
        occurred_at: input.occurred_at,
        tenant_id: input.tenant_id,
        aggregate_type: 'ONBOARDING_CASE',
        aggregate_id: input.onboarding_case_id,
        actor: input.actor,
        correlation_id: input.correlation_id,
        causation_id: input.causation_id,
        source: {
          service: 'onboarding',
          module: 'compliance_service',
          environment: process.env.NODE_ENV || 'development',
        },
        trust_level: 'STANDARD',
        requires_approval: false,
        payload: {
          worker_id: input.worker_id,
          onboarding_case_id: input.onboarding_case_id,
          bank_confirmation_status: row.bank_confirmation_status,
        },
        metadata: input.metadata || {},
      });

      return row;
    },

    async generateWpsReadiness(input) {
      assert(input.worker_id, 'worker_id is required');
      assert(input.onboarding_case_id, 'onboarding_case_id is required');
      assert(Array.isArray(input.salary_lines), 'salary_lines must be an array');

      const artifact = {
        artifact_id: input.artifact_id,
        worker_id: input.worker_id,
        onboarding_case_id: input.onboarding_case_id,
        file_name: `wps_${input.worker_id}.json`,
        structure_valid: input.salary_lines.length > 0,
        line_count: input.salary_lines.length,
        generated_at: input.generated_at,
        approver_ids: input.approver_ids || [],
      };

      await store.upsert(`wps:${input.worker_id}`, artifact);

      await hooks.publish({
        event_id: input.event_id,
        event_type: 'WPS_READINESS_GENERATED',
        event_version: '1.0',
        occurred_at: input.occurred_at,
        tenant_id: input.tenant_id,
        aggregate_type: 'ONBOARDING_CASE',
        aggregate_id: input.onboarding_case_id,
        actor: input.actor,
        correlation_id: input.correlation_id,
        causation_id: input.causation_id,
        source: {
          service: 'onboarding',
          module: 'compliance_service',
          environment: process.env.NODE_ENV || 'development',
        },
        trust_level: 'HIGH',
        requires_approval: true,
        payload: {
          artifact_id: artifact.artifact_id,
          worker_id: artifact.worker_id,
          onboarding_case_id: artifact.onboarding_case_id,
          structure_valid: artifact.structure_valid,
          line_count: artifact.line_count,
          approver_count: artifact.approver_ids.length,
        },
        metadata: input.metadata || {},
      });

      return artifact;
    },
  };
}

module.exports = {
  createComplianceService,
  InMemoryComplianceStore,
  validateIban,
};
