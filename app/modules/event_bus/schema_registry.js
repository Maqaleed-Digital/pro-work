'use strict';

const CORE_EVENT_SCHEMAS = {
  PROJECT_CREATED: {
    event_version: '1.0',
    aggregate_type: 'PROJECT',
    producer_service: 'execution_engine',
    consumer_services: ['trust_engine'],
    trust_sensitive: false,
    required: ['project_id', 'owner_user_id', 'title', 'status'],
  },
  WORKSTREAM_CREATED: {
    event_version: '1.0',
    aggregate_type: 'WORKSTREAM',
    producer_service: 'execution_engine',
    consumer_services: ['trust_engine'],
    trust_sensitive: false,
    required: ['workstream_id', 'project_id', 'stream_name', 'created_by'],
  },
  MILESTONE_CREATED: {
    event_version: '1.0',
    aggregate_type: 'MILESTONE',
    producer_service: 'execution_engine',
    consumer_services: ['trust_engine'],
    trust_sensitive: false,
    required: ['milestone_id', 'workstream_id', 'project_id', 'created_by'],
  },
  EXECUTION_JOB_CREATED: {
    event_version: '1.0',
    aggregate_type: 'EXECUTION_JOB',
    producer_service: 'execution_engine',
    consumer_services: ['trust_engine'],
    trust_sensitive: false,
    required: ['execution_job_id', 'project_id', 'milestone_id', 'job_type', 'status'],
  },
  EXECUTION_JOB_COMPLETED: {
    event_version: '1.0',
    aggregate_type: 'EXECUTION_JOB',
    producer_service: 'execution_engine',
    consumer_services: ['trust_engine'],
    trust_sensitive: false,
    required: ['execution_job_id', 'project_id', 'milestone_id', 'job_type', 'status', 'artifact_count', 'requires_approval'],
  },
  DELIVERABLE_SUBMITTED: {
    event_version: '1.0',
    aggregate_type: 'DELIVERABLE',
    producer_service: 'execution_engine',
    consumer_services: ['trust_engine'],
    trust_sensitive: false,
    required: ['deliverable_id', 'project_id', 'milestone_id', 'submitted_by', 'status'],
  },
  DELIVERABLE_APPROVED: {
    event_version: '1.0',
    aggregate_type: 'DELIVERABLE',
    producer_service: 'execution_engine',
    consumer_services: ['trust_engine'],
    trust_sensitive: true,
    required: ['deliverable_id', 'project_id', 'milestone_id', 'approval_record_id', 'approved_by', 'status'],
  },
  AGENT_JOB_COMPLETED: {
    event_version: '1.0',
    aggregate_type: 'AGENT_JOB',
    producer_service: 'ai_fabric',
    consumer_services: ['trust_engine'],
    trust_sensitive: true,
    required: ['agent_job_id', 'agent_id', 'agent_version_id', 'project_id', 'task_id', 'status', 'step_count', 'artifact_count', 'policy_profile_id'],
  },
  PHR_REVIEW_APPROVED: {
    event_version: '1.0',
    aggregate_type: 'APPROVAL',
    producer_service: 'trust_engine',
    consumer_services: ['trust_engine', 'reputation_engine'],
    trust_sensitive: true,
    required: ['phr_review_id', 'deliverable_id', 'agent_job_id', 'reviewer_user_id', 'review_status', 'signed_hash', 'evidence_pack_id'],
  },
  MILESTONE_COMPLETED: {
    event_version: '1.0',
    aggregate_type: 'MILESTONE',
    producer_service: 'execution_engine',
    consumer_services: ['trust_engine', 'reputation_engine'],
    trust_sensitive: true,
    required: ['milestone_id', 'workstream_id', 'project_id', 'completed_by_actor_type', 'completed_by_actor_id', 'approval_record_id', 'evidence_pack_id'],
  },
  EVIDENCE_PACK_GENERATED: {
    event_version: '1.0',
    aggregate_type: 'EVIDENCE_PACK',
    producer_service: 'trust_engine',
    consumer_services: ['trust_engine'],
    trust_sensitive: true,
    required: ['evidence_pack_id', 'related_event_id', 'artifact_uri', 'status'],
  },
  TRUST_LEDGER_APPENDED: {
    event_version: '1.0',
    aggregate_type: 'TRUST_EVENT',
    producer_service: 'trust_engine',
    consumer_services: ['trust_engine'],
    trust_sensitive: true,
    required: ['ledger_entry_id', 'action_type', 'entry_hash', 'prev_hash', 'payload_digest', 'evidence_pack_id'],
  },
  TOKEN_ISSUED: {
    event_version: '1.0',
    aggregate_type: 'TOKEN',
    producer_service: 'reputation_engine',
    consumer_services: ['trust_engine', 'reputation_engine'],
    trust_sensitive: true,
    required: ['token_id', 'owner_user_id', 'token_type', 'issuer_tenant_id', 'payload_hash', 'issued_at'],
  },
  ESCROW_HOLD_CREATED: {
    event_version: '1.0',
    aggregate_type: 'ESCROW',
    producer_service: 'wallet_escrow',
    consumer_services: ['trust_engine'],
    trust_sensitive: false,
    required: ['escrow_id', 'project_id', 'amount', 'currency_code', 'created_by'],
  },
  ESCROW_RELEASED: {
    event_version: '1.0',
    aggregate_type: 'ESCROW',
    producer_service: 'wallet_escrow',
    consumer_services: ['trust_engine'],
    trust_sensitive: false,
    required: ['escrow_id', 'project_id', 'released_amount', 'currency_code', 'released_by'],
  },
};

function getSchema(eventType) {
  return CORE_EVENT_SCHEMAS[eventType] || null;
}

function validatePayload(eventType, payload) {
  const schema = getSchema(eventType);
  if (!schema) {
    const err = new Error(`Unregistered event type: ${eventType}`);
    err.name = 'EventSchemaRegistryError';
    throw err;
  }
  for (const field of schema.required) {
    if (!(field in payload)) {
      const err = new Error(`Missing payload field for ${eventType}: ${field}`);
      err.name = 'EventSchemaValidationError';
      throw err;
    }
  }
  return true;
}

function listSchemas() {
  return Object.entries(CORE_EVENT_SCHEMAS).map(([eventType, schema]) => ({
    event_type: eventType,
    ...schema,
  }));
}

module.exports = {
  CORE_EVENT_SCHEMAS,
  getSchema,
  validatePayload,
  listSchemas,
};
