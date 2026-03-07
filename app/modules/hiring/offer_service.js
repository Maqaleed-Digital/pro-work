'use strict';

const { randomUUID } = require('crypto');

function assert(condition, message) {
  if (!condition) {
    const err = new Error(message);
    err.name = 'OfferServiceError';
    throw err;
  }
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

class InMemoryOfferStore {
  constructor() { this.items = new Map(); }

  async insert(item) {
    this.items.set(item.id, clone(item));
    return clone(item);
  }

  async update(id, patch) {
    const existing = this.items.get(id);
    assert(existing, `offer not found: ${id}`);
    const next = { ...existing, ...clone(patch) };
    this.items.set(id, next);
    return clone(next);
  }

  async get(id) { return this.items.has(id) ? clone(this.items.get(id)) : null; }
  async all()   { return Array.from(this.items.values()).map(clone); }
}

function createOfferService({ store, hooks }) {
  assert(store, 'store is required');
  assert(hooks && typeof hooks.publish === 'function', 'hooks.publish is required');

  return {
    async draftOffer(input) {
      assert(input.hiring_case_id, 'hiring_case_id is required');

      const id       = randomUUID();
      const occurred = input.occurred_at || new Date().toISOString();
      const event_id = input.event_id    || randomUUID();
      const actor    = input.actor       || { actor_type: 'SYSTEM', actor_id: 'offer-service' };
      const corr     = input.correlation_id || randomUUID();
      const caus     = input.causation_id   || event_id;

      const rec = {
        id,
        hiring_case_id: input.hiring_case_id,
        ...(input.package_data || {}),
        status:     'DRAFT',
        created_at: occurred,
      };

      await store.insert(rec);

      await hooks.publish({
        event_id,
        event_type:     'OFFER_DRAFTED',
        event_version:  '1.0',
        occurred_at:    occurred,
        tenant_id:      input.tenant_id,
        aggregate_type: 'OFFER',
        aggregate_id:   id,
        actor,
        correlation_id: corr,
        causation_id:   caus,
        source: { service: 'hiring', module: 'offer_service', environment: process.env.NODE_ENV || 'development' },
        trust_level:      'STANDARD',
        requires_approval: false,
        payload: { id, hiring_case_id: input.hiring_case_id },
        metadata: input.metadata || {},
      });

      return rec;
    },

    async sendOffer(input) {
      const offer_id = typeof input === 'string' ? input : input.offer_id;
      assert(offer_id, 'offer_id is required');

      const rec = await store.get(offer_id);
      assert(rec, `offer not found: ${offer_id}`);

      const occurred = (typeof input === 'object' && input.occurred_at) || new Date().toISOString();
      const event_id = (typeof input === 'object' && input.event_id)    || randomUUID();
      const actor    = (typeof input === 'object' && input.actor)       || { actor_type: 'SYSTEM', actor_id: 'offer-service' };
      const corr     = (typeof input === 'object' && input.correlation_id) || randomUUID();
      const caus     = (typeof input === 'object' && input.causation_id)   || event_id;

      const updated = await store.update(offer_id, { status: 'SENT' });

      await hooks.publish({
        event_id,
        event_type:     'OFFER_SENT',
        event_version:  '1.0',
        occurred_at:    occurred,
        tenant_id:      rec.tenant_id || (typeof input === 'object' && input.tenant_id),
        aggregate_type: 'OFFER',
        aggregate_id:   offer_id,
        actor,
        correlation_id: corr,
        causation_id:   caus,
        source: { service: 'hiring', module: 'offer_service', environment: process.env.NODE_ENV || 'development' },
        trust_level:      'STANDARD',
        requires_approval: false,
        payload: { offer_id },
        metadata: (typeof input === 'object' && input.metadata) || {},
      });

      return updated;
    },

    async getOffer(id) { return store.get(id); },
    async listOffers() { return store.all(); },
  };
}

module.exports = { createOfferService, InMemoryOfferStore };
