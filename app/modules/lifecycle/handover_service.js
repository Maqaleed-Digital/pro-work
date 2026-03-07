'use strict';

function assert(condition, message) {
  if (!condition) {
    const err = new Error(message);
    err.name = 'HandoverServiceError';
    throw err;
  }
}

class InMemoryHandoverStore {
  constructor() {
    this.rows = [];
  }

  async insert(row) {
    this.rows.push(JSON.parse(JSON.stringify(row)));
    return JSON.parse(JSON.stringify(row));
  }

  async all() {
    return JSON.parse(JSON.stringify(this.rows));
  }
}

function createHandoverService({ store, hooks }) {
  assert(store, 'store is required');
  assert(hooks && typeof hooks.publish === 'function', 'hooks.publish is required');

  return {
    async record(input) {
      assert(input.offboarding_case_id, 'offboarding_case_id is required');
      assert(input.worker_id, 'worker_id is required');
      assert(input.asset_type, 'asset_type is required');

      const row = await store.insert({
        handover_id: input.handover_id,
        offboarding_case_id: input.offboarding_case_id,
        worker_id: input.worker_id,
        asset_type: input.asset_type,
        recipient_actor_id: input.recipient_actor_id,
        recorded_at: input.recorded_at || new Date().toISOString()
      });

      const event_id = input.event_id || 'evt-' + Math.random().toString(36).slice(2);
      const occurred_at = input.occurred_at || new Date().toISOString();
      const actor = input.actor || { actor_type: 'SYSTEM', actor_id: 'system' };

      await hooks.publish({
        event_id,
        event_type: 'HANDOVER_RECORDED',
        event_version: '1.0',
        occurred_at,
        tenant_id: input.tenant_id,
        aggregate_type: 'OFFBOARDING_CASE',
        aggregate_id: input.offboarding_case_id,
        actor,
        correlation_id: input.correlation_id || event_id,
        causation_id: input.causation_id || event_id,
        source: {
          service: 'lifecycle',
          module: 'handover_service',
          environment: process.env.NODE_ENV || 'development'
        },
        trust_level: 'HIGH',
        requires_approval: true,
        payload: {
          handover_id: row.handover_id,
          offboarding_case_id: row.offboarding_case_id,
          worker_id: row.worker_id,
          asset_type: row.asset_type
        },
        metadata: input.metadata || {}
      });

      return row;
    }
  };
}

module.exports = {
  createHandoverService,
  InMemoryHandoverStore
};
