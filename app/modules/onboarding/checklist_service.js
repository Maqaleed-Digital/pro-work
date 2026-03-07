'use strict';

function assert(condition, message) {
  if (!condition) {
    const err = new Error(message);
    err.name = 'ChecklistServiceError';
    throw err;
  }
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

class InMemoryChecklistStore {
  constructor() {
    this.items = new Map();
  }

  async insert(item) {
    this.items.set(item.checklist_item_id, clone(item));
    return clone(item);
  }

  async update(id, patch) {
    const existing = this.items.get(id);
    assert(existing, `checklist item not found: ${id}`);
    const next = { ...existing, ...clone(patch) };
    this.items.set(id, next);
    return clone(next);
  }

  async get(id) {
    return this.items.has(id) ? clone(this.items.get(id)) : null;
  }

  async byCase(onboardingCaseId) {
    return Array.from(this.items.values())
      .filter((x) => x.onboarding_case_id === onboardingCaseId)
      .map(clone);
  }
}

function createChecklistService({ store, hooks }) {
  assert(store, 'store is required');
  assert(hooks && typeof hooks.publish === 'function', 'hooks.publish is required');

  return {
    async startOnboarding(input) {
      assert(input.onboarding_case_id, 'onboarding_case_id is required');
      await hooks.publish({
        event_id: input.event_id,
        event_type: 'ONBOARDING_STARTED',
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
          module: 'checklist_service',
          environment: process.env.NODE_ENV || 'development',
        },
        trust_level: 'STANDARD',
        requires_approval: false,
        payload: {
          onboarding_case_id: input.onboarding_case_id,
          worker_id: input.worker_id,
          checklist_template: input.checklist_template || 'DEFAULT_KSA',
        },
        metadata: input.metadata || {},
      });

      return {
        onboarding_case_id: input.onboarding_case_id,
        worker_id: input.worker_id,
        checklist_template: input.checklist_template || 'DEFAULT_KSA',
      };
    },

    async createChecklistItem(input) {
      assert(input.checklist_item_id, 'checklist_item_id is required');
      assert(input.onboarding_case_id, 'onboarding_case_id is required');
      assert(input.title, 'title is required');

      const item = {
        checklist_item_id: input.checklist_item_id,
        onboarding_case_id: input.onboarding_case_id,
        title: input.title,
        item_type: input.item_type || 'TASK',
        status: 'PENDING',
        due_at: input.due_at || null,
        created_at: input.created_at,
        updated_at: input.created_at,
      };

      await store.insert(item);
      return item;
    },

    async completeChecklistItem(input) {
      const updated = await store.update(input.checklist_item_id, {
        status: 'COMPLETED',
        completed_by: input.completed_by,
        completed_at: input.completed_at,
        updated_at: input.completed_at,
      });

      await hooks.publish({
        event_id: input.event_id,
        event_type: 'ONBOARDING_CHECKLIST_ITEM_COMPLETED',
        event_version: '1.0',
        occurred_at: input.occurred_at,
        tenant_id: input.tenant_id,
        aggregate_type: 'ONBOARDING_CASE',
        aggregate_id: updated.onboarding_case_id,
        actor: input.actor,
        correlation_id: input.correlation_id,
        causation_id: input.causation_id,
        source: {
          service: 'onboarding',
          module: 'checklist_service',
          environment: process.env.NODE_ENV || 'development',
        },
        trust_level: 'STANDARD',
        requires_approval: false,
        payload: {
          checklist_item_id: updated.checklist_item_id,
          onboarding_case_id: updated.onboarding_case_id,
          item_type: updated.item_type,
          title: updated.title,
        },
        metadata: input.metadata || {},
      });

      return updated;
    },

    async listCaseChecklist(onboardingCaseId) {
      return store.byCase(onboardingCaseId);
    },
  };
}

module.exports = {
  createChecklistService,
  InMemoryChecklistStore,
};
