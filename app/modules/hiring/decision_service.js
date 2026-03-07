'use strict';

function assert(condition, message) {
  if (!condition) {
    const err = new Error(message);
    err.name = 'DecisionServiceError';
    throw err;
  }
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

class InMemoryDecisionStore {
  constructor() { this.items = new Map(); }

  async insert(item) {
    this.items.set(item.decision_id, clone(item));
    return clone(item);
  }

  async get(id) { return this.items.has(id) ? clone(this.items.get(id)) : null; }
  async all()   { return Array.from(this.items.values()).map(clone); }
}

function createDecisionService({ store, hooks }) {
  assert(store, 'store is required');
  assert(hooks && typeof hooks.publish === 'function', 'hooks.publish is required');

  return {
    async recordDecision(input) {
      assert(input.decision_id,    'decision_id is required');
      assert(input.requisition_id, 'requisition_id is required');
      assert(input.candidate_id,   'candidate_id is required');
      assert(['HIRED', 'NOT_HIRED'].includes(input.decision),
        'decision must be HIRED or NOT_HIRED');
      assert(input.decided_by, 'decided_by is required');

      const record = {
        decision_id:    input.decision_id,
        tenant_id:      input.tenant_id,
        requisition_id: input.requisition_id,
        candidate_id:   input.candidate_id,
        offer_id:       input.offer_id || null,
        decision:       input.decision,
        decided_by:     input.decided_by,
        decision_reason: input.decision_reason || null,
        decided_at:     input.decided_at,
        created_at:     input.created_at,
      };

      await store.insert(record);

      await hooks.publish({
        event_id:       input.event_id,
        event_type:     'HIRING_DECISION_RECORDED',
        event_version:  '1.0',
        occurred_at:    input.occurred_at,
        tenant_id:      input.tenant_id,
        aggregate_type: 'HIRING_DECISION',
        aggregate_id:   input.decision_id,
        actor:          input.actor,
        correlation_id: input.correlation_id,
        causation_id:   input.causation_id,
        source: { service: 'hiring', module: 'decision_service', environment: process.env.NODE_ENV || 'development' },
        trust_level:      'HIGH',
        requires_approval: true,
        payload: {
          decision_id:    input.decision_id,
          requisition_id: input.requisition_id,
          candidate_id:   input.candidate_id,
          decision:       input.decision,
          decided_by:     input.decided_by,
        },
        metadata: input.metadata || {},
      });

      return record;
    },

    async getDecision(id) { return store.get(id); },
    async listDecisions() { return store.all(); },
  };
}

module.exports = { createDecisionService, InMemoryDecisionStore };
