'use strict';

const { randomUUID } = require('crypto');

function assert(condition, message) {
  if (!condition) {
    const err = new Error(message);
    err.name = 'CompensationServiceError';
    throw err;
  }
}

function createCompensationService({ hooks }) {
  assert(hooks && typeof hooks.publish === 'function', 'hooks.publish is required');

  return {
    async validateCompensation(input) {
      assert(input.id,              'id is required');
      assert(input.base_salary > 0, 'invalid salary');
      assert(input.currency,        'missing currency');

      const gross = input.base_salary +
        (input.allowances || []).reduce((s, a) => s + a.amount, 0);

      const occurred = input.occurred_at || new Date().toISOString();
      const event_id = input.event_id    || randomUUID();
      const actor    = input.actor       || { actor_type: 'SYSTEM', actor_id: 'compensation-service' };
      const corr     = input.correlation_id || randomUUID();
      const caus     = input.causation_id   || event_id;

      await hooks.publish({
        event_id,
        event_type:     'OFFER_COMPENSATION_VALIDATED',
        event_version:  '1.0',
        occurred_at:    occurred,
        tenant_id:      input.tenant_id,
        aggregate_type: 'OFFER',
        aggregate_id:   input.id,
        actor,
        correlation_id: corr,
        causation_id:   caus,
        source: { service: 'hiring', module: 'compensation_service', environment: process.env.NODE_ENV || 'development' },
        trust_level:      'STANDARD',
        requires_approval: false,
        payload: { gross },
        metadata: input.metadata || {},
      });

      return { gross_amount: gross };
    },
  };
}

module.exports = { createCompensationService };
