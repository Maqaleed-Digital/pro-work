# WORKCAPTAIN / PROWORK — PHASE 51
## Audit Export + Governed Closure Certification Activation

Status: ACTIVE
Source-of-truth input commit: 1be96682d762282a269e9c0e018022778fb32d05

## Purpose
Phase 51 expands governed trust closure into audit export and formal closure certification.

## Multi-flow scope
Flow A: INTAKE_CREATED → OPPORTUNITY_REGISTERED → COMMAND_CENTER_STATE_UPDATED
Flow B: OPPORTUNITY_STAGE_ADVANCED → BOARD_QUEUE_STATE_UPDATED
Flow C: APPROVAL_RECORDED → OPPORTUNITY_APPROVED → DECISION_AUDIT_UPDATED
Flow D: WORK_ITEM_CREATED → EXECUTION_QUEUE_UPDATED → COMMAND_CENTER_CASEWORK_UPDATED
Flow E: WORK_ITEM_STARTED → EXECUTION_QUEUE_UPDATED → EXECUTION_PROGRESS_UPDATED
Flow F: WORK_ITEM_COMPLETED → EXECUTION_QUEUE_UPDATED → EXECUTION_PROGRESS_UPDATED
Flow G: DELIVERY_ARTIFACT_CREATED → DELIVERY_EVIDENCE_UPDATED → COMMAND_CENTER_DELIVERY_UPDATED
Flow H: EVIDENCE_PACK_CREATED → TRUST_CLOSURE_UPDATED → COMMAND_CENTER_TRUST_UPDATED
Flow I: CLOSURE_CERTIFICATION_CREATED → AUDIT_EXPORT_GENERATED → COMMAND_CENTER_CERTIFICATION_UPDATED

## Mandatory runtime rules
- No certification may be created unless evidence pack exists
- No certification creation without actorId, actorRole, title, summary, and certificationType
- Only board_operator may create governed certifications
- Every certification action must append event envelope records
- Audit export must derive from persisted certification + upstream linked records only
