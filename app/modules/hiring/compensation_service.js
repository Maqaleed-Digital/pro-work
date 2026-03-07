'use strict';

function assert(condition, message) {
  if (!condition) {
    const err = new Error(message);
    err.name = 'CompensationServiceError';
    throw err;
  }
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

class InMemoryCompensationStore {
  constructor() { this.items = new Map(); }

  async insert(item) {
    this.items.set(item.package_id, clone(item));
    return clone(item);
  }

  async update(id, patch) {
    const existing = this.items.get(id);
    assert(existing, `compensation package not found: ${id}`);
    const next = { ...existing, ...clone(patch) };
    this.items.set(id, next);
    return clone(next);
  }

  async get(id) { return this.items.has(id) ? clone(this.items.get(id)) : null; }
  async all()   { return Array.from(this.items.values()).map(clone); }
}

function createCompensationService({ store, hooks }) {
  assert(store, 'store is required');
  assert(hooks && typeof hooks.publish === 'function', 'hooks.publish is required');

  return {
    async draftPackage(input) {
      assert(input.package_id,     'package_id is required');
      assert(input.requisition_id, 'requisition_id is required');
      assert(input.candidate_id,   'candidate_id is required');
      assert(typeof input.base_salary === 'number' && input.base_salary > 0,
        'base_salary must be a positive number');

      const pkg = {
        package_id:       input.package_id,
        tenant_id:        input.tenant_id,
        requisition_id:   input.requisition_id,
        candidate_id:     input.candidate_id,
        base_salary:      input.base_salary,
        currency:         input.currency || 'SAR',
        allowances:       input.allowances || [],
        benefits:         input.benefits || [],
        bonus_structure:  input.bonus_structure || null,
        status:           'DRAFT',
        created_at:       input.created_at,
        updated_at:       input.created_at,
      };

      await store.insert(pkg);

      await hooks.publish({
        event_id:       input.event_id,
        event_type:     'COMPENSATION_PACKAGE_DRAFTED',
        event_version:  '1.0',
        occurred_at:    input.occurred_at,
        tenant_id:      input.tenant_id,
        aggregate_type: 'COMPENSATION_PACKAGE',
        aggregate_id:   input.package_id,
        actor:          input.actor,
        correlation_id: input.correlation_id,
        causation_id:   input.causation_id,
        source: { service: 'hiring', module: 'compensation_service', environment: process.env.NODE_ENV || 'development' },
        trust_level:      'STANDARD',
        requires_approval: false,
        payload: {
          package_id:     input.package_id,
          requisition_id: input.requisition_id,
          candidate_id:   input.candidate_id,
          base_salary:    input.base_salary,
          currency:       pkg.currency,
          allowance_count: pkg.allowances.length,
        },
        metadata: input.metadata || {},
      });

      return pkg;
    },

    async approvePackage(input) {
      assert(input.package_id, 'package_id is required');
      assert(input.approved_by, 'approved_by is required');

      const pkg = await store.get(input.package_id);
      assert(pkg, `compensation package not found: ${input.package_id}`);
      assert(pkg.status === 'DRAFT',
        `package must be in DRAFT to approve, currently ${pkg.status}`);

      const updated = await store.update(input.package_id, {
        status:      'APPROVED',
        approved_by: input.approved_by,
        approved_at: input.approved_at,
        updated_at:  input.approved_at,
      });

      await hooks.publish({
        event_id:       input.event_id,
        event_type:     'COMPENSATION_PACKAGE_APPROVED',
        event_version:  '1.0',
        occurred_at:    input.occurred_at,
        tenant_id:      updated.tenant_id,
        aggregate_type: 'COMPENSATION_PACKAGE',
        aggregate_id:   input.package_id,
        actor:          input.actor,
        correlation_id: input.correlation_id,
        causation_id:   input.causation_id,
        source: { service: 'hiring', module: 'compensation_service', environment: process.env.NODE_ENV || 'development' },
        trust_level:      'HIGH',
        requires_approval: true,
        payload: {
          package_id:     input.package_id,
          requisition_id: updated.requisition_id,
          candidate_id:   updated.candidate_id,
          base_salary:    updated.base_salary,
          currency:       updated.currency,
          approved_by:    input.approved_by,
        },
        metadata: input.metadata || {},
      });

      return updated;
    },

    async getPackage(id) { return store.get(id); },
    async listPackages() { return store.all(); },
  };
}

module.exports = { createCompensationService, InMemoryCompensationStore };
