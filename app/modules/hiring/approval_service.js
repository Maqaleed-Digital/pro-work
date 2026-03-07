'use strict';

const { randomUUID } = require('crypto');

function assert(condition, message) {
  if (!condition) {
    const err = new Error(message);
    err.name = 'ApprovalServiceError';
    throw err;
  }
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

class InMemoryApprovalStore {
  constructor() { this.items = new Map(); }

  async insert(item) {
    this.items.set(item.hiring_case_id, clone(item));
    return clone(item);
  }

  async get(hiring_case_id) {
    return this.items.has(hiring_case_id) ? clone(this.items.get(hiring_case_id)) : null;
  }

  async all() { return Array.from(this.items.values()).map(clone); }
}

function createApprovalService({ store, hooks }) {
  assert(store, 'store is required');
  assert(hooks && typeof hooks.publish === 'function', 'hooks.publish is required');

  return {
    async requestApproval(input) {
      assert(input.hiring_case_id, 'hiring_case_id is required');
      assert(input.actor_id,       'actor_id is required');

      const occurred = input.occurred_at || new Date().toISOString();
      const event_id = input.event_id    || randomUUID();
      const actor    = input.actor       || { actor_type: 'SYSTEM', actor_id: input.actor_id };
      const corr     = input.correlation_id || randomUUID();
      const caus     = input.causation_id   || event_id;

      await hooks.publish({
        event_id,
        event_type:     'OFFER_APPROVAL_REQUESTED',
        event_version:  '1.0',
        occurred_at:    occurred,
        tenant_id:      input.tenant_id,
        aggregate_type: 'HIRING_CASE',
        aggregate_id:   input.hiring_case_id,
        actor,
        correlation_id: corr,
        causation_id:   caus,
        source: { service: 'hiring', module: 'approval_service', environment: process.env.NODE_ENV || 'development' },
        trust_level:      'STANDARD',
        requires_approval: false,
        payload: { hiring_case_id: input.hiring_case_id },
        metadata: input.metadata || {},
      });

      return { hiring_case_id: input.hiring_case_id, actor_id: input.actor_id };
    },

    async approveOffer(input) {
      assert(input.hiring_case_id, 'hiring_case_id is required');
      assert(input.actor_id,       'actor_id is required');

      const occurred = input.occurred_at || new Date().toISOString();
      const event_id = input.event_id    || randomUUID();
      const actor    = input.actor       || { actor_type: 'HUMAN', actor_id: input.actor_id };
      const corr     = input.correlation_id || randomUUID();
      const caus     = input.causation_id   || event_id;

      await store.insert({ hiring_case_id: input.hiring_case_id, actor_id: input.actor_id, decision: 'APPROVED' });

      await hooks.publish({
        event_id,
        event_type:     'OFFER_APPROVED',
        event_version:  '1.0',
        occurred_at:    occurred,
        tenant_id:      input.tenant_id,
        aggregate_type: 'HIRING_CASE',
        aggregate_id:   input.hiring_case_id,
        actor,
        correlation_id: corr,
        causation_id:   caus,
        source: { service: 'hiring', module: 'approval_service', environment: process.env.NODE_ENV || 'development' },
        trust_level:      'HIGH',
        requires_approval: true,
        payload: { actor_id: input.actor_id },
        metadata: input.metadata || {},
      });

      return true;
    },

    async getApproval(hiring_case_id) { return store.get(hiring_case_id); },
    async listApprovals() { return store.all(); },
  };
}

module.exports = { createApprovalService, InMemoryApprovalStore };
