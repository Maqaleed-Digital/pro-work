# WORKCAPTAIN / PROWORK — PHASE 45 AUTHORIZATION AND STATE CONTRACT

## Roles
- requester
- board_operator
- system_viewer

## Governing rule
Only actor role `board_operator` may advance opportunity stage.

## Allowed advancement path
- COMMAND_VISIBLE -> BOARD_REVIEW
- BOARD_REVIEW -> APPROVED

## Forbidden behavior
- No backward stage mutation
- No unlisted stage transitions
- No transition without actorRole evidence
- No direct board queue insertion without opportunity state

## Headers
Stage advancement route reads:
- x-actor-id
- x-actor-role

If role is missing or invalid, reject with HTTP 403.

## Board queue projection rule
Board queue shows opportunities in:
- BOARD_REVIEW
- APPROVED

Projection must be derived from persisted opportunity state, never from UI-only memory.
