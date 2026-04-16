'use strict';

function assert(condition, message) {
  if (!condition) {
    const err = new Error(message);
    err.name = 'OffboardingServiceError';
    throw err;
  }
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

class InMemoryOffboardingStore {
  constructor() {
    this.cases = new Map();
    this.items = new Map();
  }

  async insertCase(item) {
    this.cases.set(item.offboarding_case_id, clone(item));
    return clone(item);
  }

  async getCase(id) {
    return this.cases.has(id) ? clone(this.cases.get(id)) : null;
  }

  async updateCase(id, patch) {
    const current = this.cases.get(id);
    assert(current, `offboarding case not found: ${id}`);
    const next = { ...current, ...clone(patch) };
    this.cases.set(id, next);
    return clone(next);
  }

  async insertItem(item) {
    this.items.set(item.item_id, clone(item));
    return clone(item);
  }

  async updateItem(id, patch) {
    const current = this.items.get(id);
    assert(current, `offboarding item not found: ${id}`);
    const next = { ...current, ...clone(patch) };
    this.items.set(id, next);
    return clone(next);
  }
}

function autoEventFields(input) {
  return {
    event_id: input.event_id || 'evt-' + Math.random().toString(36).slice(2),
    occurred_at: input.occurred_at || new Date().toISOString(),
    actor: input.actor || { actor_type: 'SYSTEM', actor_id: 'system' }
  };
}

function createOffboardingService({ store, hooks, evidencePackService }) {
  assert(store, 'store is required');
  assert(hooks && typeof hooks.publish === 'function', 'hooks.publish is required');
  // evidencePackService is optional — absent means no central EP registration (backward compatible)

  return {
    async initiateCase(input) {
      assert(input.offboarding_case_id, 'offboarding_case_id is required');
      assert(input.worker_id, 'worker_id is required');
      assert(input.tenant_id, 'tenant_id is required');

      const row = await store.insertCase({
        offboarding_case_id: input.offboarding_case_id,
        tenant_id: input.tenant_id,
        worker_id: input.worker_id,
        notice_date: input.notice_date || null,
        status: 'INITIATED',
        created_at: input.created_at || new Date().toISOString()
      });

      const auto = autoEventFields(input);

      await hooks.publish({
        event_id: auto.event_id,
        event_type: 'OFFBOARDING_INITIATED',
        event_version: '1.0',
        occurred_at: auto.occurred_at,
        tenant_id: input.tenant_id,
        aggregate_type: 'OFFBOARDING_CASE',
        aggregate_id: input.offboarding_case_id,
        actor: auto.actor,
        correlation_id: input.correlation_id || auto.event_id,
        causation_id: input.causation_id || auto.event_id,
        source: {
          service: 'lifecycle',
          module: 'offboarding_service',
          environment: process.env.NODE_ENV || 'development'
        },
        trust_level: 'STANDARD',
        requires_approval: false,
        payload: {
          offboarding_case_id: input.offboarding_case_id,
          worker_id: input.worker_id,
          status: row.status
        },
        metadata: input.metadata || {}
      });

      return row;
    },

    async completeChecklistItem(input) {
      assert(input.item_id, 'item_id is required');
      const current = await store.items.get(input.item_id);
      if (!current) {
        await store.insertItem({
          item_id: input.item_id,
          offboarding_case_id: input.offboarding_case_id,
          title: input.title || 'UNNAMED',
          status: 'PENDING'
        });
      }

      const row = await store.updateItem(input.item_id, {
        status: 'COMPLETED',
        completed_at: input.completed_at || new Date().toISOString(),
        completed_by: input.completed_by || null
      });

      const auto = autoEventFields(input);

      await hooks.publish({
        event_id: auto.event_id,
        event_type: 'OFFBOARDING_CHECKLIST_ITEM_COMPLETED',
        event_version: '1.0',
        occurred_at: auto.occurred_at,
        tenant_id: input.tenant_id,
        aggregate_type: 'OFFBOARDING_CASE',
        aggregate_id: input.offboarding_case_id,
        actor: auto.actor,
        correlation_id: input.correlation_id || auto.event_id,
        causation_id: input.causation_id || auto.event_id,
        source: {
          service: 'lifecycle',
          module: 'offboarding_service',
          environment: process.env.NODE_ENV || 'development'
        },
        trust_level: 'STANDARD',
        requires_approval: false,
        payload: {
          item_id: input.item_id,
          offboarding_case_id: input.offboarding_case_id,
          title: row.title
        },
        metadata: input.metadata || {}
      });

      return row;
    },

    async completeFinalSettlementChecklist(input) {
      assert(input.offboarding_case_id, 'offboarding_case_id is required');

      const auto = autoEventFields(input);

      await hooks.publish({
        event_id: auto.event_id,
        event_type: 'FINAL_SETTLEMENT_CHECKLIST_COMPLETED',
        event_version: '1.0',
        occurred_at: auto.occurred_at,
        tenant_id: input.tenant_id,
        aggregate_type: 'OFFBOARDING_CASE',
        aggregate_id: input.offboarding_case_id,
        actor: auto.actor,
        correlation_id: input.correlation_id || auto.event_id,
        causation_id: input.causation_id || auto.event_id,
        source: {
          service: 'lifecycle',
          module: 'offboarding_service',
          environment: process.env.NODE_ENV || 'development'
        },
        trust_level: 'HIGH',
        requires_approval: true,
        payload: {
          offboarding_case_id: input.offboarding_case_id,
          checklist_status: 'COMPLETED',
          approver_count: (input.approver_ids || []).length
        },
        metadata: input.metadata || {}
      });

      return {
        offboarding_case_id: input.offboarding_case_id,
        checklist_status: 'COMPLETED'
      };
    },

    async generateEvidencePack(input) {
      assert(input.offboarding_case_id, 'offboarding_case_id is required');

      const auto = autoEventFields(input);

      await hooks.publish({
        event_id: auto.event_id,
        event_type: 'OFFBOARDING_EVIDENCE_PACK_GENERATED',
        event_version: '1.0',
        occurred_at: auto.occurred_at,
        tenant_id: input.tenant_id,
        aggregate_type: 'OFFBOARDING_CASE',
        aggregate_id: input.offboarding_case_id,
        actor: auto.actor,
        correlation_id: input.correlation_id || auto.event_id,
        causation_id: input.causation_id || auto.event_id,
        source: {
          service: 'lifecycle',
          module: 'offboarding_service',
          environment: process.env.NODE_ENV || 'development'
        },
        trust_level: 'HIGH',
        requires_approval: true,
        payload: {
          offboarding_case_id: input.offboarding_case_id,
          evidence_pack_id: input.evidence_pack_id,
          handover_count: input.handover_count || 0
        },
        metadata: input.metadata || {}
      });

      // S38-G2: register EP_WOS_OFFBOARD_01 with central evidence pack service on generateEvidencePack
      if (evidencePackService && input.evidence_pack_id) {
        await evidencePackService.create({
          pack_id:         input.evidence_pack_id,
          pack_type:       'EP_WOS_OFFBOARD_01',
          tenant_id:       input.tenant_id,
          actor: {
            actor_id:   auto.actor?.actor_id   || 'system',
            actor_name: auto.actor?.actor_name || 'System',
            actor_role: auto.actor?.actor_type || 'SYSTEM',
          },
          action:          `Evidence pack generated for offboarding case ${input.offboarding_case_id}`,
          data_snapshot:   { offboarding_case_id: input.offboarding_case_id, handover_count: input.handover_count || 0 },
          attached_files:  [],
          approval_chain:  input.approval_chain || [],
          ai_artifacts:    [],
          redaction_rules: [],
        });
      }

      return {
        offboarding_case_id: input.offboarding_case_id,
        evidence_pack_id: input.evidence_pack_id
      };
    },

    async completeOffboarding(input) {
      assert(input.offboarding_case_id, 'offboarding_case_id is required');
      const row = await store.updateCase(input.offboarding_case_id, {
        status: 'COMPLETED',
        completed_at: input.completed_at || new Date().toISOString()
      });

      const auto = autoEventFields(input);

      await hooks.publish({
        event_id: auto.event_id,
        event_type: 'OFFBOARDING_COMPLETED',
        event_version: '1.0',
        occurred_at: auto.occurred_at,
        tenant_id: input.tenant_id,
        aggregate_type: 'OFFBOARDING_CASE',
        aggregate_id: input.offboarding_case_id,
        actor: auto.actor,
        correlation_id: input.correlation_id || auto.event_id,
        causation_id: input.causation_id || auto.event_id,
        source: {
          service: 'lifecycle',
          module: 'offboarding_service',
          environment: process.env.NODE_ENV || 'development'
        },
        trust_level: 'HIGH',
        requires_approval: true,
        payload: {
          offboarding_case_id: input.offboarding_case_id,
          worker_id: row.worker_id,
          status: row.status
        },
        metadata: input.metadata || {}
      });

      return row;
    }
  };
}

module.exports = {
  createOffboardingService,
  InMemoryOffboardingStore
};
