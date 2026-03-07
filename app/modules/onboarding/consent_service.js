'use strict';

function assert(condition, message) {
  if (!condition) {
    const err = new Error(message);
    err.name = 'ConsentServiceError';
    throw err;
  }
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

class InMemoryConsentStore {
  constructor() {
    this.items = [];
  }

  async insert(item) {
    this.items.push(clone(item));
    return clone(item);
  }

  async all() {
    return this.items.map(clone);
  }
}

function createConsentService({ store, hooks }) {
  assert(store, 'store is required');
  assert(hooks && typeof hooks.publish === 'function', 'hooks.publish is required');

  return {
    async acknowledgeConsent(input) {
      assert(input.consent_id, 'consent_id is required');
      assert(input.onboarding_case_id, 'onboarding_case_id is required');
      assert(input.worker_id, 'worker_id is required');

      const item = {
        consent_id: input.consent_id,
        tenant_id: input.tenant_id,
        worker_id: input.worker_id,
        onboarding_case_id: input.onboarding_case_id,
        consent_type: input.consent_type,
        consent_version: input.consent_version,
        acknowledged_at: input.acknowledged_at,
      };

      await store.insert(item);

      await hooks.publish({
        event_id: input.event_id,
        event_type: 'CONSENT_ACKNOWLEDGED',
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
          module: 'consent_service',
          environment: process.env.NODE_ENV || 'development',
        },
        trust_level: 'STANDARD',
        requires_approval: false,
        payload: {
          consent_id: input.consent_id,
          worker_id: input.worker_id,
          consent_type: input.consent_type,
          consent_version: input.consent_version,
        },
        metadata: input.metadata || {},
      });

      return item;
    },
  };
}

module.exports = {
  createConsentService,
  InMemoryConsentStore,
};
