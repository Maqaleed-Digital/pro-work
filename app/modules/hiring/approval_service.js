'use strict';

function assert(condition, message) {
  if (!condition) {
    const err = new Error(message);
    err.name = 'ApprovalServiceError';
    throw err;
  }
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

class InMemoryApprovalStore {
  constructor() { this.items = new Map(); }

  async insert(item) {
    this.items.set(item.approval_id, clone(item));
    return clone(item);
  }

  async update(id, patch) {
    const existing = this.items.get(id);
    assert(existing, `approval not found: ${id}`);
    const next = { ...existing, ...clone(patch) };
    this.items.set(id, next);
    return clone(next);
  }

  async get(id) { return this.items.has(id) ? clone(this.items.get(id)) : null; }
  async all()   { return Array.from(this.items.values()).map(clone); }
}

function createApprovalService({ store, hooks }) {
  assert(store, 'store is required');
  assert(hooks && typeof hooks.publish === 'function', 'hooks.publish is required');

  return {
    async requestApproval(input) {
      assert(input.approval_id,    'approval_id is required');
      assert(input.offer_id,       'offer_id is required');
      assert(input.requisition_id, 'requisition_id is required');
      assert(input.requested_by,   'requested_by is required');
      assert(input.approver_id,    'approver_id is required');

      const approval = {
        approval_id:    input.approval_id,
        tenant_id:      input.tenant_id,
        offer_id:       input.offer_id,
        requisition_id: input.requisition_id,
        requested_by:   input.requested_by,
        approver_id:    input.approver_id,
        approval_level: input.approval_level || 'L1',
        status:         'PENDING',
        requested_at:   input.requested_at,
        created_at:     input.created_at,
      };

      await store.insert(approval);

      await hooks.publish({
        event_id:       input.event_id,
        event_type:     'HIRING_APPROVAL_REQUESTED',
        event_version:  '1.0',
        occurred_at:    input.occurred_at,
        tenant_id:      input.tenant_id,
        aggregate_type: 'HIRING_APPROVAL',
        aggregate_id:   input.approval_id,
        actor:          input.actor,
        correlation_id: input.correlation_id,
        causation_id:   input.causation_id,
        source: { service: 'hiring', module: 'approval_service', environment: process.env.NODE_ENV || 'development' },
        trust_level:      'STANDARD',
        requires_approval: false,
        payload: {
          approval_id:    input.approval_id,
          offer_id:       input.offer_id,
          requisition_id: input.requisition_id,
          requested_by:   input.requested_by,
          approver_id:    input.approver_id,
        },
        metadata: input.metadata || {},
      });

      return approval;
    },

    async recordApproval(input) {
      assert(input.approval_id, 'approval_id is required');
      assert(input.approver_id, 'approver_id is required');
      assert(['APPROVED', 'REJECTED'].includes(input.decision),
        'decision must be APPROVED or REJECTED');

      const approval = await store.get(input.approval_id);
      assert(approval, `approval not found: ${input.approval_id}`);
      assert(approval.status === 'PENDING',
        `approval must be PENDING to record decision, currently ${approval.status}`);

      const updated = await store.update(input.approval_id, {
        status:      input.decision,
        decision:    input.decision,
        approver_id: input.approver_id,
        decided_at:  input.decided_at,
        notes:       input.notes || '',
      });

      await hooks.publish({
        event_id:       input.event_id,
        event_type:     'HIRING_APPROVAL_RECORDED',
        event_version:  '1.0',
        occurred_at:    input.occurred_at,
        tenant_id:      updated.tenant_id,
        aggregate_type: 'HIRING_APPROVAL',
        aggregate_id:   input.approval_id,
        actor:          input.actor,
        correlation_id: input.correlation_id,
        causation_id:   input.causation_id,
        source: { service: 'hiring', module: 'approval_service', environment: process.env.NODE_ENV || 'development' },
        trust_level:      'HIGH',
        requires_approval: true,
        payload: {
          approval_id: input.approval_id,
          offer_id:    updated.offer_id,
          decision:    input.decision,
          approver_id: input.approver_id,
        },
        metadata: input.metadata || {},
      });

      return updated;
    },

    async getApproval(id) { return store.get(id); },
    async listApprovals() { return store.all(); },
  };
}

module.exports = { createApprovalService, InMemoryApprovalStore };
