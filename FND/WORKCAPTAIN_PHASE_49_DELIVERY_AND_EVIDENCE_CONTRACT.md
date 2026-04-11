# WORKCAPTAIN / PROWORK — PHASE 49 DELIVERY AND EVIDENCE CONTRACT

## Roles
- requester
- board_operator
- system_viewer

## Governing rule
Only actor role `board_operator` may create governed delivery artifacts in Phase 49.

## Delivery artifact prerequisites
Delivery artifact creation is allowed only when:
- work item exists
- work item status = COMPLETED
- actorRole = board_operator
- actorId is present
- title is present
- summary is present
- artifactType is present

## Delivery artifact minimum fields
Each delivery artifact must contain:
- deliveryArtifactId, workItemId, opportunityId, title, summary, artifactType
- evidenceState, reviewState, actorId, actorRole, createdAt

## Initial delivery state
- evidenceState = EVIDENCE_CAPTURED
- reviewState = DELIVERY_VISIBLE
