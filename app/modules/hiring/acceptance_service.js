'use strict';

const { randomUUID } = require('crypto');

function assert(condition, message) {
  if (!condition) {
    const err = new Error(message);
    err.name = 'AcceptanceServiceError';
    throw err;
  }
}

function createAcceptanceService({ hooks }) {
  assert(hooks && typeof hooks.publish === 'function', 'hooks.publish is required');

  async function _emit(offer_id, event_type, trust_level, requires_approval, input) {
    const occurred = input.occurred_at || new Date().toISOString();
    const event_id = input.event_id    || randomUUID();
    const actor    = input.actor       || { actor_type: 'HUMAN', actor_id: offer_id };
    const corr     = input.correlation_id || randomUUID();
    const caus     = input.causation_id   || event_id;

    await hooks.publish({
      event_id,
      event_type,
      event_version:  '1.0',
      occurred_at:    occurred,
      tenant_id:      input.tenant_id,
      aggregate_type: 'OFFER',
      aggregate_id:   offer_id,
      actor,
      correlation_id: corr,
      causation_id:   caus,
      source: { service: 'hiring', module: 'acceptance_service', environment: process.env.NODE_ENV || 'development' },
      trust_level,
      requires_approval,
      payload: { offer_id },
      metadata: input.metadata || {},
    });
  }

  return {
    async acceptOffer(input) {
      const offer_id = typeof input === 'string' ? input : input.offer_id;
      assert(offer_id, 'offer_id is required');
      const ctx = typeof input === 'object' ? input : {};
      await _emit(offer_id, 'OFFER_ACCEPTED', 'HIGH', true, ctx);
      return { offer_id, status: 'ACCEPTED' };
    },

    async declineOffer(input) {
      const offer_id = typeof input === 'string' ? input : input.offer_id;
      assert(offer_id, 'offer_id is required');
      const ctx = typeof input === 'object' ? input : {};
      await _emit(offer_id, 'OFFER_DECLINED', 'STANDARD', false, ctx);
      return { offer_id, status: 'DECLINED' };
    },
  };
}

module.exports = { createAcceptanceService };
