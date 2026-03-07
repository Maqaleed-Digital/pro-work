'use strict';

const { randomUUID } = require('crypto');

function assert(condition, message) {
  if (!condition) {
    const err = new Error(message);
    err.name = 'HiringCaseServiceError';
    throw err;
  }
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

class InMemoryHiringCaseStore {
  constructor() { this.items = new Map(); }

  async insert(item) {
    this.items.set(item.id, clone(item));
    return clone(item);
  }

  async update(id, patch) {
    const existing = this.items.get(id);
    assert(existing, `hiring case not found: ${id}`);
    const next = { ...existing, ...clone(patch) };
    this.items.set(id, next);
    return clone(next);
  }

  async get(id) { return this.items.has(id) ? clone(this.items.get(id)) : null; }
  async all()   { return Array.from(this.items.values()).map(clone); }
}

function createHiringCaseService({ store, hooks }) {
  assert(store, 'store is required');
  assert(hooks && typeof hooks.publish === 'function', 'hooks.publish is required');

  return {
    async openHiringCase(input) {
      assert(input.tenant_id,      'tenant_id is required');
      assert(input.candidate_id,   'candidate_id is required');
      assert(input.requisition_id, 'requisition_id is required');

      const id         = randomUUID();
      const occurred   = input.occurred_at || new Date().toISOString();
      const event_id   = input.event_id    || randomUUID();
      const actor      = input.actor       || { actor_type: 'SYSTEM', actor_id: 'hiring-case-service' };
      const corr       = input.correlation_id || randomUUID();
      const caus       = input.causation_id   || event_id;

      const rec = {
        id,
        tenant_id:      input.tenant_id,
        candidate_id:   input.candidate_id,
        requisition_id: input.requisition_id,
        status:         'SCREENED',
        created_at:     occurred,
      };

      await store.insert(rec);

      await hooks.publish({
        event_id,
        event_type:     'HIRING_CASE_OPENED',
        event_version:  '1.0',
        occurred_at:    occurred,
        tenant_id:      input.tenant_id,
        aggregate_type: 'HIRING_CASE',
        aggregate_id:   id,
        actor,
        correlation_id: corr,
        causation_id:   caus,
        source: { service: 'hiring', module: 'hiring_case_service', environment: process.env.NODE_ENV || 'development' },
        trust_level:      'STANDARD',
        requires_approval: false,
        payload: {
          id,
          tenant_id:      input.tenant_id,
          candidate_id:   input.candidate_id,
          requisition_id: input.requisition_id,
        },
        metadata: input.metadata || {},
      });

      return rec;
    },

    async recordDecision(input) {
      assert(input.case_id,  'case_id is required');
      assert(input.decision, 'decision is required');

      const rec = await store.get(input.case_id);
      assert(rec, `hiring case not found: ${input.case_id}`);

      const occurred = input.occurred_at || new Date().toISOString();
      const event_id = input.event_id    || randomUUID();
      const actor    = input.actor       || { actor_type: 'SYSTEM', actor_id: 'hiring-case-service' };
      const corr     = input.correlation_id || randomUUID();
      const caus     = input.causation_id   || event_id;

      const updated = await store.update(input.case_id, { status: input.decision });

      await hooks.publish({
        event_id,
        event_type:     'HIRING_DECISION_RECORDED',
        event_version:  '1.0',
        occurred_at:    occurred,
        tenant_id:      rec.tenant_id,
        aggregate_type: 'HIRING_CASE',
        aggregate_id:   input.case_id,
        actor,
        correlation_id: corr,
        causation_id:   caus,
        source: { service: 'hiring', module: 'hiring_case_service', environment: process.env.NODE_ENV || 'development' },
        trust_level:      'HIGH',
        requires_approval: true,
        payload: { decision: input.decision },
        metadata: input.metadata || {},
      });

      return updated;
    },

    async getCase(id) { return store.get(id); },
    async listCases() { return store.all(); },
  };
}

module.exports = { createHiringCaseService, InMemoryHiringCaseStore };
