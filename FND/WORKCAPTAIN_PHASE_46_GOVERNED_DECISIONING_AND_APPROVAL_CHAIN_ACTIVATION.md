# WORKCAPTAIN / PROWORK — PHASE 46
## Governed Decisioning + Approval Chain Activation

Status: ACTIVE
Source-of-truth input commit: 6a3c964cfc9e66f10cc9a284e8103eb2afd8640c
Execution model: Option C (Hybrid)

## Purpose
Phase 46 expands the governed runtime from multi-flow state movement into explicit institutional decisioning.

This phase introduces:
- approval record creation
- board approve / reject routes
- decision audit timeline
- approval-chain event emission
- command-center decision summaries
- browser demo for governed board decisioning

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
APPROVAL_RECORDED
→ OPPORTUNITY_REJECTED
→ DECISION_AUDIT_UPDATED

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
- GET /api/board/queue
- GET /api/events
- GET /phase46-demo
- GET /phase46-demo/app.js
- GET /phase46-demo/styles.css

## Mandatory runtime rules
- No decision without board_operator authorization
- No approve / reject action unless opportunity is in BOARD_REVIEW
- Every decision must create an approval record
- All decision actions append event envelope records
- Decision audit must derive from persisted records only
- Invalid decision actions remain fail-closed

## Acceptance criteria
- invalid intake remains blocked
- unauthorized approval returns HTTP 403
- invalid approve / reject stage returns HTTP 422
- authorized approval returns HTTP 200
- opportunity decision audit route resolves live runtime state
- board queue excludes APPROVED and REJECTED items after final decision
- event inspection route returns approval-chain events
- browser demo renders live decisioning state
