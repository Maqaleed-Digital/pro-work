# WORKCAPTAIN / PROWORK — PHASE 50 TRUST CLOSURE AND EVIDENCE PACK CONTRACT

## Roles
- requester
- board_operator
- system_viewer

## Governing rule
Only actor role `board_operator` may create governed evidence packs in Phase 50.

## Evidence pack prerequisites
Delivery artifact must exist. actorId, title, summary, packType all required.

## Evidence pack minimum fields
evidencePackId, deliveryArtifactId, workItemId, opportunityId, title, summary, packType, trustState, exportState, actorId, actorRole, createdAt

## Initial trust state
- trustState = TRUST_CAPTURED
- exportState = PACK_VISIBLE
