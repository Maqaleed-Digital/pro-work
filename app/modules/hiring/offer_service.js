'use strict';

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
    this.items.set(item.offer_id, clone(item));
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

// PENDING → SENT | WITHDRAWN
// SENT    → WITHDRAWN
const OFFER_TRANSITIONS = new Map([
  ['PENDING',   ['SENT', 'WITHDRAWN']],
  ['SENT',      ['WITHDRAWN']],
  ['WITHDRAWN', []],
]);

function createOfferService({ store, hooks }) {
  assert(store, 'store is required');
  assert(hooks && typeof hooks.publish === 'function', 'hooks.publish is required');

  return {
    async createOffer(input) {
      assert(input.offer_id,       'offer_id is required');
      assert(input.requisition_id, 'requisition_id is required');
      assert(input.candidate_id,   'candidate_id is required');
      assert(input.package_id,     'package_id is required');

      const offer = {
        offer_id:       input.offer_id,
        tenant_id:      input.tenant_id,
        requisition_id: input.requisition_id,
        candidate_id:   input.candidate_id,
        package_id:     input.package_id,
        expiry_date:    input.expiry_date || null,
        status:         'PENDING',
        created_at:     input.created_at,
        updated_at:     input.created_at,
      };

      await store.insert(offer);

      await hooks.publish({
        event_id:       input.event_id,
        event_type:     'HIRING_OFFER_CREATED',
        event_version:  '1.0',
        occurred_at:    input.occurred_at,
        tenant_id:      input.tenant_id,
        aggregate_type: 'HIRING_OFFER',
        aggregate_id:   input.offer_id,
        actor:          input.actor,
        correlation_id: input.correlation_id,
        causation_id:   input.causation_id,
        source: { service: 'hiring', module: 'offer_service', environment: process.env.NODE_ENV || 'development' },
        trust_level:      'STANDARD',
        requires_approval: false,
        payload: {
          offer_id:       input.offer_id,
          requisition_id: input.requisition_id,
          candidate_id:   input.candidate_id,
          package_id:     input.package_id,
        },
        metadata: input.metadata || {},
      });

      return offer;
    },

    async sendOffer(input) {
      assert(input.offer_id,  'offer_id is required');
      assert(input.sent_by,   'sent_by is required');
      assert(input.expiry_date, 'expiry_date is required');

      const offer = await store.get(input.offer_id);
      assert(offer, `offer not found: ${input.offer_id}`);
      const allowed = OFFER_TRANSITIONS.get(offer.status) || [];
      assert(allowed.includes('SENT'), `invalid offer transition: ${offer.status} -> SENT`);

      const updated = await store.update(input.offer_id, {
        status:      'SENT',
        sent_by:     input.sent_by,
        sent_at:     input.sent_at,
        expiry_date: input.expiry_date,
        updated_at:  input.sent_at,
      });

      await hooks.publish({
        event_id:       input.event_id,
        event_type:     'HIRING_OFFER_SENT',
        event_version:  '1.0',
        occurred_at:    input.occurred_at,
        tenant_id:      updated.tenant_id,
        aggregate_type: 'HIRING_OFFER',
        aggregate_id:   input.offer_id,
        actor:          input.actor,
        correlation_id: input.correlation_id,
        causation_id:   input.causation_id,
        source: { service: 'hiring', module: 'offer_service', environment: process.env.NODE_ENV || 'development' },
        trust_level:      'HIGH',
        requires_approval: true,
        payload: {
          offer_id:       input.offer_id,
          requisition_id: updated.requisition_id,
          candidate_id:   updated.candidate_id,
          expiry_date:    input.expiry_date,
          sent_by:        input.sent_by,
        },
        metadata: input.metadata || {},
      });

      return updated;
    },

    async withdrawOffer(input) {
      assert(input.offer_id,    'offer_id is required');
      assert(input.withdrawn_by, 'withdrawn_by is required');
      assert(input.reason_code, 'reason_code is required');

      const offer = await store.get(input.offer_id);
      assert(offer, `offer not found: ${input.offer_id}`);
      const allowed = OFFER_TRANSITIONS.get(offer.status) || [];
      assert(allowed.includes('WITHDRAWN'), `invalid offer transition: ${offer.status} -> WITHDRAWN`);

      const updated = await store.update(input.offer_id, {
        status:        'WITHDRAWN',
        withdrawn_by:  input.withdrawn_by,
        withdrawn_at:  input.withdrawn_at,
        reason_code:   input.reason_code,
        updated_at:    input.withdrawn_at,
      });

      await hooks.publish({
        event_id:       input.event_id,
        event_type:     'HIRING_OFFER_WITHDRAWN',
        event_version:  '1.0',
        occurred_at:    input.occurred_at,
        tenant_id:      updated.tenant_id,
        aggregate_type: 'HIRING_OFFER',
        aggregate_id:   input.offer_id,
        actor:          input.actor,
        correlation_id: input.correlation_id,
        causation_id:   input.causation_id,
        source: { service: 'hiring', module: 'offer_service', environment: process.env.NODE_ENV || 'development' },
        trust_level:      'HIGH',
        requires_approval: true,
        payload: {
          offer_id:       input.offer_id,
          requisition_id: updated.requisition_id,
          candidate_id:   updated.candidate_id,
          withdrawn_by:   input.withdrawn_by,
          reason_code:    input.reason_code,
        },
        metadata: input.metadata || {},
      });

      return updated;
    },

    async getOffer(id) { return store.get(id); },
    async listOffers() { return store.all(); },
  };
}

module.exports = { createOfferService, InMemoryOfferStore };
