'use strict';

const CORE_EVENT_SCHEMAS = {

  // ── Sprint D: Sovereign Hiring ────────────────────────────────────────────────

  HIRING_CASE_OPENED: {
    event_version: '1.0',
    aggregate_type: 'HIRING_CASE',
    producer_service: 'hiring',
    consumer_services: ['analytics'],
    trust_sensitive: false,
    required: ['id', 'tenant_id', 'candidate_id', 'requisition_id'],
  },
  HIRING_DECISION_RECORDED: {
    event_version: '1.0',
    aggregate_type: 'HIRING_CASE',
    producer_service: 'hiring',
    consumer_services: ['trust_engine', 'analytics'],
    trust_sensitive: true,
    required: ['decision'],
  },
  OFFER_DRAFTED: {
    event_version: '1.0',
    aggregate_type: 'OFFER',
    producer_service: 'hiring',
    consumer_services: ['analytics'],
    trust_sensitive: false,
    required: ['id', 'hiring_case_id'],
  },
  OFFER_COMPENSATION_VALIDATED: {
    event_version: '1.0',
    aggregate_type: 'OFFER',
    producer_service: 'hiring',
    consumer_services: ['analytics'],
    trust_sensitive: false,
    required: ['gross'],
  },
  OFFER_APPROVAL_REQUESTED: {
    event_version: '1.0',
    aggregate_type: 'HIRING_CASE',
    producer_service: 'hiring',
    consumer_services: ['analytics'],
    trust_sensitive: false,
    required: ['hiring_case_id'],
  },
  OFFER_APPROVED: {
    event_version: '1.0',
    aggregate_type: 'HIRING_CASE',
    producer_service: 'hiring',
    consumer_services: ['trust_engine', 'analytics'],
    trust_sensitive: true,
    required: ['actor_id'],
  },
  OFFER_SENT: {
    event_version: '1.0',
    aggregate_type: 'OFFER',
    producer_service: 'hiring',
    consumer_services: ['analytics'],
    trust_sensitive: false,
    required: ['offer_id'],
  },
  OFFER_ACCEPTED: {
    event_version: '1.0',
    aggregate_type: 'OFFER',
    producer_service: 'hiring',
    consumer_services: ['trust_engine', 'analytics'],
    trust_sensitive: true,
    required: ['offer_id'],
  },
  OFFER_DECLINED: {
    event_version: '1.0',
    aggregate_type: 'OFFER',
    producer_service: 'hiring',
    consumer_services: ['analytics'],
    trust_sensitive: false,
    required: ['offer_id'],
  },
  CONTRACT_MIRROR_MAPPED: {
    event_version: '1.0',
    aggregate_type: 'HIRING_CASE',
    producer_service: 'hiring',
    consumer_services: ['trust_engine', 'analytics'],
    trust_sensitive: true,
    required: ['parity_score'],
  },
  HIRING_CONTRACT_SIGNED: {
    event_version: '1.0',
    aggregate_type: 'HIRING_CASE',
    producer_service: 'hiring',
    consumer_services: ['trust_engine', 'analytics'],
    trust_sensitive: true,
    required: ['case_id'],
  },
  HIRING_CONTRACT_ACTIVATED: {
    event_version: '1.0',
    aggregate_type: 'HIRING_CASE',
    producer_service: 'hiring',
    consumer_services: ['trust_engine', 'analytics'],
    trust_sensitive: true,
    required: ['case_id'],
  },


  // ── Sprint C: Sovereign Onboarding ───────────────────────────────────────────

  ONBOARDING_STARTED: {
    event_version: '1.0',
    aggregate_type: 'ONBOARDING_CASE',
    producer_service: 'onboarding',
    consumer_services: ['analytics'],
    trust_sensitive: false,
    required: ['onboarding_case_id', 'worker_id', 'checklist_template'],
  },
  ONBOARDING_CHECKLIST_ITEM_COMPLETED: {
    event_version: '1.0',
    aggregate_type: 'ONBOARDING_CASE',
    producer_service: 'onboarding',
    consumer_services: ['analytics'],
    trust_sensitive: false,
    required: ['checklist_item_id', 'onboarding_case_id', 'item_type', 'title'],
  },
  DOCUMENT_VERIFIED: {
    event_version: '1.0',
    aggregate_type: 'ONBOARDING_CASE',
    producer_service: 'onboarding',
    consumer_services: ['trust_engine', 'analytics'],
    trust_sensitive: true,
    required: ['document_id', 'worker_id', 'onboarding_case_id', 'document_type', 'verification_status'],
  },
  IBAN_CAPTURED: {
    event_version: '1.0',
    aggregate_type: 'ONBOARDING_CASE',
    producer_service: 'onboarding',
    consumer_services: ['analytics'],
    trust_sensitive: false,
    required: ['worker_id', 'onboarding_case_id', 'bank_confirmation_status'],
  },
  WPS_READINESS_GENERATED: {
    event_version: '1.0',
    aggregate_type: 'ONBOARDING_CASE',
    producer_service: 'onboarding',
    consumer_services: ['trust_engine', 'analytics'],
    trust_sensitive: true,
    required: ['artifact_id', 'worker_id', 'onboarding_case_id', 'structure_valid', 'line_count', 'approver_count'],
  },
  CONTRACT_DRAFTED: {
    event_version: '1.0',
    aggregate_type: 'ONBOARDING_CASE',
    producer_service: 'onboarding',
    consumer_services: ['analytics'],
    trust_sensitive: false,
    required: ['contract_id', 'worker_id', 'role_title', 'probation_days'],
  },
  CONTRACT_SIGNED: {
    event_version: '1.0',
    aggregate_type: 'ONBOARDING_CASE',
    producer_service: 'onboarding',
    consumer_services: ['trust_engine', 'analytics'],
    trust_sensitive: true,
    required: ['contract_id', 'onboarding_case_id', 'previous_status', 'next_status'],
  },
  CONTRACT_ACTIVATED: {
    event_version: '1.0',
    aggregate_type: 'ONBOARDING_CASE',
    producer_service: 'onboarding',
    consumer_services: ['trust_engine', 'analytics'],
    trust_sensitive: true,
    required: ['contract_id', 'onboarding_case_id', 'previous_status', 'next_status'],
  },
  CONSENT_ACKNOWLEDGED: {
    event_version: '1.0',
    aggregate_type: 'ONBOARDING_CASE',
    producer_service: 'onboarding',
    consumer_services: ['analytics'],
    trust_sensitive: false,
    required: ['consent_id', 'worker_id', 'consent_type', 'consent_version'],
  },
  PROBATION_PACK_GENERATED: {
    event_version: '1.0',
    aggregate_type: 'ONBOARDING_CASE',
    producer_service: 'onboarding',
    consumer_services: ['trust_engine', 'analytics'],
    trust_sensitive: true,
    required: ['probation_case_id', 'worker_id', 'onboarding_case_id', 'task_completion_count', 'manager_review_count'],
  },
  PROBATION_DECISION_RECORDED: {
    event_version: '1.0',
    aggregate_type: 'ONBOARDING_CASE',
    producer_service: 'onboarding',
    consumer_services: ['trust_engine', 'analytics'],
    trust_sensitive: true,
    required: ['probation_case_id', 'worker_id', 'onboarding_case_id', 'decision', 'reason_code', 'extension_days'],
  },


  // ── Sprint B: Sovereign Recruiting (BRD V3) ─────────────────────────────────

  CANDIDATE_CREATED: {
    event_version: '1.0',
    aggregate_type: 'CANDIDATE',
    producer_service: 'recruiting',
    consumer_services: ['analytics'],
    trust_sensitive: false,
    required: ['candidate_id', 'candidate_type', 'full_name', 'nationality_code', 'availability_status', 'preferred_role_family', 'skill_count'],
  },
  CANDIDATE_UPDATED: {
    event_version: '1.0',
    aggregate_type: 'CANDIDATE',
    producer_service: 'recruiting',
    consumer_services: ['analytics'],
    trust_sensitive: false,
    required: ['candidate_id', 'current_status', 'availability_status', 'skill_count'],
  },
  REQUISITION_CREATED: {
    event_version: '1.0',
    aggregate_type: 'REQUISITION',
    producer_service: 'recruiting',
    consumer_services: ['analytics'],
    trust_sensitive: false,
    required: ['requisition_id', 'establishment_id', 'title', 'role_family', 'contract_type', 'employment_type', 'internal_first', 'skill_count'],
  },
  REQUISITION_STATUS_CHANGED: {
    event_version: '1.0',
    aggregate_type: 'REQUISITION',
    producer_service: 'recruiting',
    consumer_services: ['analytics'],
    trust_sensitive: false,
    required: ['requisition_id', 'previous_status', 'next_status', 'role_family'],
  },
  CANDIDATE_MATCHED: {
    event_version: '1.0',
    aggregate_type: 'REQUISITION',
    producer_service: 'recruiting',
    consumer_services: ['analytics'],
    trust_sensitive: false,
    required: ['requisition_id', 'candidate_id', 'final_score', 'candidate_type', 'missing_skill_count'],
  },
  CANDIDATE_SHORTLISTED: {
    event_version: '1.0',
    aggregate_type: 'REQUISITION',
    producer_service: 'recruiting',
    consumer_services: ['trust_engine', 'analytics'],
    trust_sensitive: true,
    required: ['requisition_id', 'candidate_id', 'shortlist_reason', 'reviewer_outcome'],
  },
  NITAQAT_PREVIEW_GENERATED: {
    event_version: '1.0',
    aggregate_type: 'CANDIDATE',
    producer_service: 'recruiting',
    consumer_services: ['trust_engine', 'analytics'],
    trust_sensitive: true,
    required: ['candidate_id', 'requisition_id', 'movement_band', 'confidence_band', 'override_applied', 'driver_count'],
  },
  OCCUPATION_MATCH_VALIDATED: {
    event_version: '1.0',
    aggregate_type: 'CANDIDATE',
    producer_service: 'recruiting',
    consumer_services: ['trust_engine', 'analytics'],
    trust_sensitive: true,
    required: ['candidate_id', 'requisition_id', 'valid', 'issue_count', 'recommended_occupation_code'],
  },
  AI_MATCH_EXPLANATION_LOGGED: {
    event_version: '1.0',
    aggregate_type: 'REQUISITION',
    producer_service: 'recruiting',
    consumer_services: ['trust_engine', 'analytics'],
    trust_sensitive: true,
    required: ['requisition_id', 'candidate_id', 'final_score', 'explanation', 'reviewer_required'],
  },

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
  if (!schema) return { valid: false, errors: [`Unknown event type: ${eventType}`] };
  const errors = [];
  for (const field of (schema.required || [])) {
    if (payload[field] === undefined || payload[field] === null) {
      errors.push(`Missing required field: ${field}`);
    }
  }
  return { valid: errors.length === 0, errors };
}

function listSchemas() {
  return Object.keys(CORE_EVENT_SCHEMAS).map(event_type => ({
    event_type,
    ...CORE_EVENT_SCHEMAS[event_type],
  }));
}

module.exports = {
  CORE_EVENT_SCHEMAS,
  getSchema,
  validatePayload,
  listSchemas,
};
