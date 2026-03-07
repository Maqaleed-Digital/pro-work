'use strict';

function assert(condition, message) {
  if (!condition) {
    const err = new Error(message);
    err.name = 'AcceptanceServiceError';
    throw err;
  }
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

class InMemoryAcceptanceStore {
  constructor() { this.items = new Map(); }

  async insert(item) {
    this.items.set(item.acceptance_id, clone(item));
    return clone(item);
  }

  async get(id) { return this.items.has(id) ? clone(this.items.get(id)) : null; }
  async all()   { return Array.from(this.items.values()).map(clone); }
}

function createAcceptanceService({ store, hooks }) {
  assert(store, 'store is required');
  assert(hooks && typeof hooks.publish === 'function', 'hooks.publish is required');

  return {
    async recordAcceptance(input) {
      assert(input.acceptance_id, 'acceptance_id is required');
      assert(input.offer_id,      'offer_id is required');
      assert(input.candidate_id,  'candidate_id is required');
      assert(['ACCEPTED', 'DECLINED'].includes(input.response),
        'response must be ACCEPTED or DECLINED');
      assert(input.responded_at,  'responded_at is required');

      const acceptance = {
        acceptance_id: input.acceptance_id,
        tenant_id:     input.tenant_id,
        offer_id:      input.offer_id,
        candidate_id:  input.candidate_id,
        response:      input.response,
        responded_at:  input.responded_at,
        decline_reason: input.decline_reason || null,
        created_at:    input.created_at,
      };

      await store.insert(acceptance);

      await hooks.publish({
        event_id:       input.event_id,
        event_type:     'CANDIDATE_ACCEPTANCE_RECORDED',
        event_version:  '1.0',
        occurred_at:    input.occurred_at,
        tenant_id:      input.tenant_id,
        aggregate_type: 'HIRING_OFFER',
        aggregate_id:   input.offer_id,
        actor:          input.actor,
        correlation_id: input.correlation_id,
        causation_id:   input.causation_id,
        source: { service: 'hiring', module: 'acceptance_service', environment: process.env.NODE_ENV || 'development' },
        trust_level:      'HIGH',
        requires_approval: true,
        payload: {
          acceptance_id: input.acceptance_id,
          offer_id:      input.offer_id,
          candidate_id:  input.candidate_id,
          response:      input.response,
          responded_at:  input.responded_at,
        },
        metadata: input.metadata || {},
      });

      return acceptance;
    },

    async getAcceptance(id) { return store.get(id); },
    async listAcceptances() { return store.all(); },
  };
}

module.exports = { createAcceptanceService, InMemoryAcceptanceStore };
