'use strict';

const { randomUUID } = require('crypto');

function assert(condition, message) {
  if (!condition) {
    const err = new Error(message);
    err.name = 'QiwaMappingServiceError';
    throw err;
  }
}

function createQiwaMappingService({ hooks }) {
  assert(hooks && typeof hooks.publish === 'function', 'hooks.publish is required');

  return {
    async mapContract(input) {
      assert(input.case_id, 'case_id is required');

      const missing = [];
      if (!input.role_title) missing.push('role_title');

      const parity   = missing.length === 0 ? 100 : 60;
      const occurred = input.occurred_at || new Date().toISOString();
      const event_id = input.event_id    || randomUUID();
      const actor    = input.actor       || { actor_type: 'SYSTEM', actor_id: 'qiwa-mapping-service' };
      const corr     = input.correlation_id || randomUUID();
      const caus     = input.causation_id   || event_id;

      await hooks.publish({
        event_id,
        event_type:     'CONTRACT_MIRROR_MAPPED',
        event_version:  '1.0',
        occurred_at:    occurred,
        tenant_id:      input.tenant_id,
        aggregate_type: 'HIRING_CASE',
        aggregate_id:   input.case_id,
        actor,
        correlation_id: corr,
        causation_id:   caus,
        source: { service: 'hiring', module: 'qiwa_mapping_service', environment: process.env.NODE_ENV || 'development' },
        trust_level:      'HIGH',
        requires_approval: true,
        payload: { parity_score: parity, missing },
        metadata: input.metadata || {},
      });

      return { parity_score: parity, missing };
    },
  };
}

module.exports = { createQiwaMappingService };
