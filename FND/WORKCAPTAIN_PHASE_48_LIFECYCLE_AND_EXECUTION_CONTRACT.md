# WORKCAPTAIN / PROWORK — PHASE 48 LIFECYCLE AND EXECUTION CONTRACT

## Roles
- requester
- board_operator
- system_viewer

## Governing rule
Only actor role `board_operator` may perform lifecycle transitions in Phase 48.

## Allowed lifecycle transitions
- READY -> IN_PROGRESS via start
- READY -> BLOCKED via block
- IN_PROGRESS -> BLOCKED via block
- IN_PROGRESS -> COMPLETED via complete

## Forbidden lifecycle behavior
- No complete from READY
- No start from BLOCKED
- No start from COMPLETED
- No block from COMPLETED
- No silent lifecycle mutation

## Execution queue projection
Execution queue returns work items in: READY, IN_PROGRESS.
Blocked and completed items must not appear in the execution queue projection.

## Work item transition evidence
Each transition must persist: actorId, actorRole, action, fromStatus, toStatus, reason (when provided), occurredAt.
