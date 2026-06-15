'use strict';

function assert(condition, message) {
  if (!condition) {
    const err = new Error(message);
    err.name = 'LifecycleServiceError';
    throw err;
  }
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

class InMemoryLifecycleStore {
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

function autoEventFields(input) {
  return {
    event_id: input.event_id || 'evt-' + Math.random().toString(36).slice(2),
    occurred_at: input.occurred_at || new Date().toISOString(),
    actor: input.actor || { actor_type: 'SYSTEM', actor_id: 'system' }
  };
}

function createLifecycleService({ store, hooks }) {
  assert(store, 'store is required');
  assert(hooks && typeof hooks.publish === 'function', 'hooks.publish is required');

  return {
    async changeWorkerStatus(input) {
      assert(input.worker_id, 'worker_id is required');
      assert(input.tenant_id, 'tenant_id is required');
      assert(input.next_status, 'next_status is required');

      const previous = await store.get(input.worker_id);
      const row = await store.upsert(input.worker_id, {
        worker_id: input.worker_id,
        tenant_id: input.tenant_id,
        current_status: input.next_status,
        previous_status: previous ? previous.current_status : null,
        updated_at: input.updated_at || new Date().toISOString()
      });

      const auto = autoEventFields(input);

      await hooks.publish({
        event_id: auto.event_id,
        event_type: 'WORKER_STATUS_CHANGED',
        event_version: '1.0',
        occurred_at: auto.occurred_at,
        tenant_id: input.tenant_id,
        aggregate_type: 'WORKER',
        aggregate_id: input.worker_id,
        actor: auto.actor,
        correlation_id: input.correlation_id || auto.event_id,
        causation_id: input.causation_id || auto.event_id,
        source: {
          service: 'lifecycle',
          module: 'lifecycle_service',
          environment: process.env.NODE_ENV || 'development'
        },
        trust_level: 'STANDARD',
        requires_approval: false,
        payload: {
          worker_id: input.worker_id,
          previous_status: row.previous_status,
          next_status: row.current_status
        },
        metadata: input.metadata || {}
      });

      return row;
    },

    async raiseAlert(input) {
      assert(input.worker_id, 'worker_id is required');
      assert(input.alert_code, 'alert_code is required');

      const auto = autoEventFields(input);

      await hooks.publish({
        event_id: auto.event_id,
        event_type: 'LIFECYCLE_ALERT_RAISED',
        event_version: '1.0',
        occurred_at: auto.occurred_at,
        tenant_id: input.tenant_id,
        aggregate_type: 'WORKER',
        aggregate_id: input.worker_id,
        actor: auto.actor,
        correlation_id: input.correlation_id || auto.event_id,
        causation_id: input.causation_id || auto.event_id,
        source: {
          service: 'lifecycle',
          module: 'lifecycle_service',
          environment: process.env.NODE_ENV || 'development'
        },
        trust_level: 'STANDARD',
        requires_approval: false,
        payload: {
          worker_id: input.worker_id,
          alert_code: input.alert_code,
          severity: input.severity || 'MEDIUM'
        },
        metadata: input.metadata || {}
      });

      return {
        worker_id: input.worker_id,
        alert_code: input.alert_code,
        severity: input.severity || 'MEDIUM'
      };
    }
  };
}

module.exports = {
  createLifecycleService,
  InMemoryLifecycleStore
};
