'use strict';

function assert(condition, message) {
  if (!condition) {
    const err = new Error(message);
    err.name = 'RequisitionServiceError';
    throw err;
  }
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

class InMemoryRequisitionStore {
  constructor() {
    this.items = new Map();
  }

  async insert(item) {
    this.items.set(item.requisition_id, clone(item));
    return clone(item);
  }

  async update(requisitionId, patch) {
    const existing = this.items.get(requisitionId);
    assert(existing, `requisition not found: ${requisitionId}`);
    const next = { ...existing, ...clone(patch) };
    this.items.set(requisitionId, next);
    return clone(next);
  }

  async get(requisitionId) {
    return this.items.has(requisitionId) ? clone(this.items.get(requisitionId)) : null;
  }

  async all() {
    return Array.from(this.items.values()).map(clone);
  }
}

const ALLOWED_STATUSES = new Map([
  ['DRAFT',        ['OPEN', 'CANCELLED']],
  ['OPEN',         ['SHORTLISTING', 'CANCELLED', 'PAUSED']],
  ['PAUSED',       ['OPEN', 'CANCELLED']],
  ['SHORTLISTING', ['INTERVIEWING', 'PAUSED', 'CANCELLED']],
  ['INTERVIEWING', ['OFFER_PENDING', 'PAUSED', 'CANCELLED']],
  ['OFFER_PENDING',['FILLED', 'OPEN', 'CANCELLED']],
  ['FILLED',       []],
  ['CANCELLED',    []],
]);

function validateCreateInput(input) {
  assert(input && typeof input === 'object', 'requisition input is required');
  assert(typeof input.requisition_id === 'string' && input.requisition_id.length > 0, 'requisition_id is required');
  assert(typeof input.tenant_id === 'string' && input.tenant_id.length > 0, 'tenant_id is required');
  assert(typeof input.title === 'string' && input.title.length > 0, 'title is required');
  assert(typeof input.role_family === 'string' && input.role_family.length > 0, 'role_family is required');
  assert(typeof input.contract_type === 'string' && input.contract_type.length > 0, 'contract_type is required');
  assert(Array.isArray(input.required_skills), 'required_skills must be an array');
  assert(typeof input.establishment_id === 'string' && input.establishment_id.length > 0, 'establishment_id is required');
}

function createRequisitionService({ store, hooks }) {
  assert(store, 'store is required');
  assert(hooks && typeof hooks.publish === 'function', 'hooks.publish is required');

  return {
    async createRequisition(input) {
      validateCreateInput(input);

      const item = {
        requisition_id:           input.requisition_id,
        tenant_id:                input.tenant_id,
        establishment_id:         input.establishment_id,
        title:                    input.title,
        role_family:              input.role_family,
        contract_type:            input.contract_type,
        employment_type:          input.employment_type || 'FTE',
        required_skills:          clone(input.required_skills),
        minimum_years_experience: input.minimum_years_experience || 0,
        status:                   'DRAFT',
        internal_first:           input.internal_first !== false,
        occupation_code_target:   input.occupation_code_target || null,
        hiring_manager_id:        input.hiring_manager_id,
        created_at:               input.created_at,
        updated_at:               input.created_at,
      };

      await store.insert(item);

      await hooks.publish({
        event_id:       input.event_id,
        event_type:     'REQUISITION_CREATED',
        event_version:  '1.0',
        occurred_at:    input.occurred_at,
        tenant_id:      input.tenant_id,
        aggregate_type: 'REQUISITION',
        aggregate_id:   input.requisition_id,
        actor:          input.actor,
        correlation_id: input.correlation_id,
        causation_id:   input.causation_id,
        source: {
          service:     'recruiting',
          module:      'requisition_service',
          environment: process.env.NODE_ENV || 'development',
        },
        trust_level:       'STANDARD',
        requires_approval: false,
        payload: {
          requisition_id:   input.requisition_id,
          establishment_id: input.establishment_id,
          title:            input.title,
          role_family:      input.role_family,
          contract_type:    input.contract_type,
          employment_type:  item.employment_type,
          internal_first:   item.internal_first,
          skill_count:      item.required_skills.length,
        },
        metadata: input.metadata || {},
      });

      return item;
    },

    async transitionStatus(input) {
      assert(input && typeof input === 'object', 'transition input is required');
      const current = await store.get(input.requisition_id);
      assert(current, `requisition not found: ${input.requisition_id}`);
      const allowed = ALLOWED_STATUSES.get(current.status) || [];
      assert(allowed.includes(input.next_status),
        `invalid requisition transition: ${current.status} -> ${input.next_status}`);

      const updated = await store.update(input.requisition_id, {
        status:     input.next_status,
        updated_at: input.updated_at,
      });

      await hooks.publish({
        event_id:       input.event_id,
        event_type:     'REQUISITION_STATUS_CHANGED',
        event_version:  '1.0',
        occurred_at:    input.occurred_at,
        tenant_id:      updated.tenant_id,
        aggregate_type: 'REQUISITION',
        aggregate_id:   updated.requisition_id,
        actor:          input.actor,
        correlation_id: input.correlation_id,
        causation_id:   input.causation_id,
        source: {
          service:     'recruiting',
          module:      'requisition_service',
          environment: process.env.NODE_ENV || 'development',
        },
        trust_level:       input.next_status === 'FILLED' ? 'HIGH' : 'STANDARD',
        requires_approval: input.next_status === 'FILLED',
        payload: {
          requisition_id:  updated.requisition_id,
          previous_status: current.status,
          next_status:     input.next_status,
          role_family:     updated.role_family,
        },
        metadata: input.metadata || {},
      });

      return updated;
    },

    async getRequisition(requisitionId) {
      return store.get(requisitionId);
    },

    async listRequisitions() {
      return store.all();
    },
  };
}

module.exports = {
  createRequisitionService,
  InMemoryRequisitionStore,
  ALLOWED_STATUSES,
};
