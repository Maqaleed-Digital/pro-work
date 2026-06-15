'use strict';

function assert(condition, message) {
  if (!condition) {
    const err = new Error(message);
    err.name = 'CandidateServiceError';
    throw err;
  }
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

class InMemoryCandidateStore {
  constructor() {
    this.items = new Map();
  }

  async insert(candidate) {
    this.items.set(candidate.candidate_id, clone(candidate));
    return clone(candidate);
  }

  async update(candidateId, patch) {
    const existing = this.items.get(candidateId);
    assert(existing, `candidate not found: ${candidateId}`);
    const next = { ...existing, ...clone(patch) };
    this.items.set(candidateId, next);
    return clone(next);
  }

  async get(candidateId) {
    return this.items.has(candidateId) ? clone(this.items.get(candidateId)) : null;
  }

  async all() {
    return Array.from(this.items.values()).map(clone);
  }
}

function validateCandidateInput(input) {
  assert(input && typeof input === 'object', 'candidate input is required');
  assert(typeof input.candidate_id === 'string' && input.candidate_id.length > 0, 'candidate_id is required');
  assert(typeof input.tenant_id === 'string' && input.tenant_id.length > 0, 'tenant_id is required');
  assert(['FTE', 'FREELANCER'].includes(input.candidate_type), 'candidate_type must be FTE or FREELANCER');
  assert(typeof input.full_name === 'string' && input.full_name.length > 0, 'full_name is required');
  assert(Array.isArray(input.skills), 'skills must be an array');
  assert(typeof input.nationality_code === 'string' && input.nationality_code.length > 0, 'nationality_code is required');
  assert(typeof input.current_status === 'string' && input.current_status.length > 0, 'current_status is required');
}

function createCandidateService({ store, hooks }) {
  assert(store, 'store is required');
  assert(hooks && typeof hooks.publish === 'function', 'hooks.publish is required');

  return {
    async createCandidate(input) {
      validateCandidateInput(input);

      const candidate = {
        candidate_id: input.candidate_id,
        tenant_id: input.tenant_id,
        candidate_type: input.candidate_type,
        full_name: input.full_name,
        email: input.email || null,
        phone: input.phone || null,
        nationality_code: input.nationality_code,
        current_status: input.current_status,
        availability_status: input.availability_status || 'AVAILABLE',
        years_experience: input.years_experience || 0,
        skills: clone(input.skills),
        credentials: clone(input.credentials || []),
        preferred_role_family: input.preferred_role_family || null,
        created_at: input.created_at,
        updated_at: input.updated_at || input.created_at,
      };

      await store.insert(candidate);

      await hooks.publish({
        event_id:       input.event_id,
        event_type:     'CANDIDATE_CREATED',
        event_version:  '1.0',
        occurred_at:    input.occurred_at,
        tenant_id:      input.tenant_id,
        aggregate_type: 'CANDIDATE',
        aggregate_id:   input.candidate_id,
        actor:          input.actor,
        correlation_id: input.correlation_id,
        causation_id:   input.causation_id,
        source: {
          service:     'recruiting',
          module:      'candidate_service',
          environment: process.env.NODE_ENV || 'development',
        },
        trust_level:       'STANDARD',
        requires_approval: false,
        payload: {
          candidate_id:          input.candidate_id,
          candidate_type:        input.candidate_type,
          full_name:             input.full_name,
          nationality_code:      input.nationality_code,
          availability_status:   candidate.availability_status,
          preferred_role_family: candidate.preferred_role_family,
          skill_count:           candidate.skills.length,
        },
        metadata: input.metadata || {},
      });

      return candidate;
    },

    async updateCandidate(input) {
      assert(input && typeof input === 'object', 'update input is required');
      assert(typeof input.candidate_id === 'string' && input.candidate_id.length > 0, 'candidate_id is required');

      const updated = await store.update(input.candidate_id, {
        full_name:             input.full_name,
        email:                 input.email,
        phone:                 input.phone,
        nationality_code:      input.nationality_code,
        current_status:        input.current_status,
        availability_status:   input.availability_status,
        years_experience:      input.years_experience,
        skills:                input.skills,
        credentials:           input.credentials,
        preferred_role_family: input.preferred_role_family,
        updated_at:            input.updated_at,
      });

      await hooks.publish({
        event_id:       input.event_id,
        event_type:     'CANDIDATE_UPDATED',
        event_version:  '1.0',
        occurred_at:    input.occurred_at,
        tenant_id:      updated.tenant_id,
        aggregate_type: 'CANDIDATE',
        aggregate_id:   updated.candidate_id,
        actor:          input.actor,
        correlation_id: input.correlation_id,
        causation_id:   input.causation_id,
        source: {
          service:     'recruiting',
          module:      'candidate_service',
          environment: process.env.NODE_ENV || 'development',
        },
        trust_level:       'STANDARD',
        requires_approval: false,
        payload: {
          candidate_id:        updated.candidate_id,
          current_status:      updated.current_status,
          availability_status: updated.availability_status,
          skill_count:         Array.isArray(updated.skills) ? updated.skills.length : 0,
        },
        metadata: input.metadata || {},
      });

      return updated;
    },

    async getCandidate(candidateId) {
      return store.get(candidateId);
    },

    async listCandidates() {
      return store.all();
    },
  };
}

module.exports = {
  createCandidateService,
  InMemoryCandidateStore,
};
