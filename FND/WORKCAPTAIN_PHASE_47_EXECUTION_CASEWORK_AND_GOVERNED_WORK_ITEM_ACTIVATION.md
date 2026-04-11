# WORKCAPTAIN / PROWORK — PHASE 47
## Execution Casework + Governed Work Item Activation

Status: ACTIVE
Source-of-truth input commit: b1b7821f59a0acc811c8591104cdd6e0161f5aa6
Execution model: Option C (Hybrid)

## Purpose
Phase 47 expands the governed runtime from board decisioning into executable operational casework.

This phase introduces:
- governed work item creation under approved opportunities
- execution work item detail and listing routes
- execution queue projection
- command-center casework summaries
- work-item lifecycle event emission
- browser demo for approved-opportunity-to-casework activation

## Multi-flow scope
Flow A:
INTAKE_CREATED
→ OPPORTUNITY_REGISTERED
→ COMMAND_CENTER_STATE_UPDATED

Flow B:
OPPORTUNITY_STAGE_ADVANCED
→ BOARD_QUEUE_STATE_UPDATED

Flow C:
APPROVAL_RECORDED
→ OPPORTUNITY_APPROVED
→ DECISION_AUDIT_UPDATED

Flow D:
WORK_ITEM_CREATED
→ EXECUTION_QUEUE_UPDATED
→ COMMAND_CENTER_CASEWORK_UPDATED

## Routes active after this phase
- GET /health
- GET /api/command-center/state
- GET /api/opportunities
- GET /api/opportunities/:id
- POST /api/intake
- POST /api/opportunities/:id/advance
- POST /api/opportunities/:id/approve
- POST /api/opportunities/:id/reject
- GET /api/opportunities/:id/decisions
- POST /api/opportunities/:id/work-items
- GET /api/opportunities/:id/work-items
- GET /api/work-items
- GET /api/work-items/:id
- GET /api/execution/queue
- GET /api/board/queue
- GET /api/events
- GET /phase47-demo
- GET /phase47-demo/app.js
- GET /phase47-demo/styles.css

## Mandatory runtime rules
- No work item may be created unless opportunity stage = APPROVED
- No work item creation without actorId, actorRole, title, and summary
- Only board_operator may create governed work items in this phase
- Every work item action must append event envelope records
- Execution queue must derive from persisted work items only
- Invalid casework actions remain fail-closed

## Acceptance criteria
- invalid intake remains blocked
- unauthorized work item creation returns HTTP 403
- work item creation before approval returns HTTP 422
- authorized work item creation after approval returns HTTP 201
- work item detail route resolves live runtime state
- execution queue reflects persisted work items
- command-center summaries include casework totals
- browser demo renders live execution casework state
