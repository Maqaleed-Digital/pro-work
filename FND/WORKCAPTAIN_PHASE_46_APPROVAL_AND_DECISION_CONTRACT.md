# WORKCAPTAIN / PROWORK — PHASE 46 APPROVAL AND DECISION CONTRACT

## Roles
- requester
- board_operator
- system_viewer

## Governing rule
Only actor role `board_operator` may approve or reject an opportunity.

## Decision prerequisites
Approve / reject is allowed only when:
- opportunity exists
- opportunity stage = BOARD_REVIEW
- actorRole = board_operator
- actorId is present
- decision reason is present

## Final states
- approve action sets opportunity stage to APPROVED
- reject action sets opportunity stage to REJECTED

## Approval record requirements
Each final decision must create an approval record containing:
- approvalId
- opportunityId
- decisionType
- actorId
- actorRole
- reason
- createdAt

## Audit projection rule
Decision audit route returns approval records for the opportunity in chronological order.
Projection must be derived from persisted state, never from UI-only memory.
