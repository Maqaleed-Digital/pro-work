# WORKCAPTAIN / PROWORK — PHASE 51 CLOSURE CERTIFICATION AND AUDIT EXPORT CONTRACT

## Roles
- requester, board_operator, system_viewer

## Governing rule
Only actor role `board_operator` may create governed closure certifications in Phase 51.

## Certification prerequisites
- evidence pack exists
- actorRole = board_operator
- actorId, title, summary, certificationType present

## Minimum fields
certificationId, evidencePackId, deliveryArtifactId, workItemId, opportunityId, title, summary, certificationType, certificationState, auditExportState, actorId, actorRole, createdAt

## Initial state
- certificationState = CERTIFIED
- auditExportState = EXPORT_READY

## Audit export rule
Derived from persisted certification + linked evidence pack, delivery artifact, work item, and opportunity.
