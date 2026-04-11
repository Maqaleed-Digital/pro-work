# WORKCAPTAIN / PROWORK — PHASE 47 CASEWORK AND EXECUTION CONTRACT

## Roles
- requester
- board_operator
- system_viewer

## Governing rule
Only actor role `board_operator` may create governed work items in Phase 47.

## Work item prerequisites
Work item creation is allowed only when:
- opportunity exists
- opportunity stage = APPROVED
- actorRole = board_operator
- actorId is present
- title is present
- summary is present

## Work item minimum fields
Each work item must contain:
- workItemId
- opportunityId
- title
- summary
- status
- actorId
- actorRole
- createdAt

## Initial work item state
New work items must start with:
- status = READY
- queueState = EXECUTION_VISIBLE

## Projection rule
Execution queue returns work items in:
- READY
- IN_PROGRESS

Projection must be derived from persisted work items, never from UI-only memory.
