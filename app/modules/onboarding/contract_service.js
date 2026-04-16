'use strict';

function assert(condition, message) {
  if (!condition) {
    const err = new Error(message);
    err.name = 'ContractServiceError';
    throw err;
  }
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

class InMemoryContractStore {
  constructor() {
    this.items = new Map();
  }

  async insert(item) {
    this.items.set(item.contract_id, clone(item));
    return clone(item);
  }

  async update(contractId, patch) {
    const existing = this.items.get(contractId);
    assert(existing, `contract not found: ${contractId}`);
    const next = { ...existing, ...clone(patch) };
    this.items.set(contractId, next);
    return clone(next);
  }

  async get(contractId) {
    return this.items.has(contractId) ? clone(this.items.get(contractId)) : null;
  }
}

const ALLOWED = new Map([
  ['DRAFT',     ['REVIEW', 'SIGNED']],
  ['REVIEW',    ['SIGNED', 'DRAFT']],
  ['SIGNED',    ['ACTIVATED']],
  ['ACTIVATED', []],
]);

function createContractService({ store, hooks, evidencePackService }) {
  assert(store, 'store is required');
  assert(hooks && typeof hooks.publish === 'function', 'hooks.publish is required');
  // evidencePackService is optional — absent means no central EP registration (backward compatible)

  return {
    async draftContract(input) {
      assert(input.contract_id, 'contract_id is required');
      assert(input.worker_id, 'worker_id is required');
      assert(input.onboarding_case_id, 'onboarding_case_id is required');

      const item = {
        contract_id: input.contract_id,
        tenant_id: input.tenant_id,
        worker_id: input.worker_id,
        onboarding_case_id: input.onboarding_case_id,
        template_id: input.template_id,
        role_title: input.role_title,
        wage_base: input.wage_base,
        allowances: input.allowances || [],
        probation_days: input.probation_days || 90,
        notice_days: input.notice_days || 30,
        status: 'DRAFT',
        created_at: input.created_at,
        updated_at: input.created_at,
      };

      await store.insert(item);

      await hooks.publish({
        event_id: input.event_id,
        event_type: 'CONTRACT_DRAFTED',
        event_version: '1.0',
        occurred_at: input.occurred_at,
        tenant_id: input.tenant_id,
        aggregate_type: 'ONBOARDING_CASE',
        aggregate_id: input.onboarding_case_id,
        actor: input.actor,
        correlation_id: input.correlation_id,
        causation_id: input.causation_id,
        source: {
          service: 'onboarding',
          module: 'contract_service',
          environment: process.env.NODE_ENV || 'development',
        },
        trust_level: 'STANDARD',
        requires_approval: false,
        payload: {
          contract_id: input.contract_id,
          worker_id: input.worker_id,
          role_title: input.role_title,
          probation_days: item.probation_days,
        },
        metadata: input.metadata || {},
      });

      return item;
    },

    async transitionContract(input) {
      const current = await store.get(input.contract_id);
      assert(current, `contract not found: ${input.contract_id}`);
      const allowed = ALLOWED.get(current.status) || [];
      assert(
        allowed.includes(input.next_status),
        `invalid contract transition: ${current.status} -> ${input.next_status}`,
      );

      const updated = await store.update(input.contract_id, {
        status: input.next_status,
        updated_at: input.updated_at,
      });

      const eventType =
        input.next_status === 'SIGNED'     ? 'CONTRACT_SIGNED'    :
        input.next_status === 'ACTIVATED'  ? 'CONTRACT_ACTIVATED' : null;

      if (eventType) {
        await hooks.publish({
          event_id: input.event_id,
          event_type: eventType,
          event_version: '1.0',
          occurred_at: input.occurred_at,
          tenant_id: updated.tenant_id,
          aggregate_type: 'ONBOARDING_CASE',
          aggregate_id: updated.onboarding_case_id,
          actor: input.actor,
          correlation_id: input.correlation_id,
          causation_id: input.causation_id,
          source: {
            service: 'onboarding',
            module: 'contract_service',
            environment: process.env.NODE_ENV || 'development',
          },
          trust_level: 'HIGH',
          requires_approval: true,
          payload: {
            contract_id: updated.contract_id,
            onboarding_case_id: updated.onboarding_case_id,
            previous_status: current.status,
            next_status: input.next_status,
          },
          metadata: input.metadata || {},
        });

        // S38-G2: register EP_WOS_HIRE_01 with central evidence pack service on CONTRACT_SIGNED
        if (input.next_status === 'SIGNED' && evidencePackService && input.evidence_pack_id) {
          await evidencePackService.create({
            pack_id:        input.evidence_pack_id,
            pack_type:      'EP_WOS_HIRE_01',
            tenant_id:      updated.tenant_id,
            actor: {
              actor_id:   input.actor?.actor_id   || 'system',
              actor_name: input.actor?.actor_name || 'System',
              actor_role: input.actor?.actor_type || 'SYSTEM',
            },
            action:          `Contract signed for worker ${updated.worker_id}`,
            data_snapshot:   { contract_id: updated.contract_id, onboarding_case_id: updated.onboarding_case_id, status: 'SIGNED' },
            attached_files:  [],
            approval_chain:  input.approval_chain || [],
            ai_artifacts:    [],
            redaction_rules: [],
          });
        }
      }

      return updated;
    },

    async getContract(contractId) {
      return store.get(contractId);
    },
  };
}

module.exports = {
  createContractService,
  InMemoryContractStore,
};
