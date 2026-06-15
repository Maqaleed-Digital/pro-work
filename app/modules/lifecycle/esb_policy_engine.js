'use strict';

function assert(condition, message) {
  if (!condition) {
    const err = new Error(message);
    err.name = 'EsbPolicyEngineError';
    throw err;
  }
}

function createEsbPolicyEngine({ hooks }) {
  assert(hooks && typeof hooks.publish === 'function', 'hooks.publish is required');

  return {
    async calculate(input) {
      assert(input.offboarding_case_id, 'offboarding_case_id is required');
      assert(input.tenant_id, 'tenant_id is required');
      assert(input.policy_version, 'policy_version is required');

      const months = input.months_of_service || 0;
      const wage = input.last_base_wage || 0;
      const factor = input.policy_version === 'KSA-ESB-V1' ? 0.5 : 0.4;
      const amount = Math.round(months * factor * (wage / 12));

      const event_id = input.event_id || 'evt-' + Math.random().toString(36).slice(2);
      const occurred_at = input.occurred_at || new Date().toISOString();
      const actor = input.actor || { actor_type: 'SYSTEM', actor_id: 'system' };

      await hooks.publish({
        event_id,
        event_type: 'ESB_CALCULATION_EXECUTED',
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
          module: 'esb_policy_engine',
          environment: process.env.NODE_ENV || 'development'
        },
        trust_level: 'HIGH',
        requires_approval: true,
        payload: {
          offboarding_case_id: input.offboarding_case_id,
          policy_version: input.policy_version,
          months_of_service: months,
          last_base_wage: wage,
          calculated_amount: amount
        },
        metadata: input.metadata || {}
      });

      return {
        offboarding_case_id: input.offboarding_case_id,
        policy_version: input.policy_version,
        calculated_amount: amount
      };
    }
  };
}

module.exports = {
  createEsbPolicyEngine
};
