# PROWORK — Sprint D / Sovereign Hiring

## Status
COMPLETE

## Baseline
- Phase 1: 5ff7de2
- Sprint A (WOS Core): f53327c
- Sprint B (Sovereign Recruiting): b5c8a62
- Sprint C (Sovereign Onboarding): 391db4a

## Scope
Full hiring lifecycle: compensation structuring, offer management, multi-level approvals,
candidate acceptance, and final hiring decision — all within the KSA sovereign context.

| Service | Operations | Trust Level |
|---------|-----------|-------------|
| compensation_service | draftPackage, approvePackage | approvePackage → HIGH |
| offer_service | createOffer, sendOffer, withdrawOffer (FSM) | sendOffer / withdrawOffer → HIGH |
| approval_service | requestApproval, recordApproval | recordApproval → HIGH |
| acceptance_service | recordAcceptance | HIGH |
| decision_service | recordDecision | HIGH |

## Events Registered (Sprint D)

| Event | trust_sensitive | aggregate_type | Notes |
|-------|----------------|---------------|-------|
| COMPENSATION_PACKAGE_DRAFTED | false | COMPENSATION_PACKAGE | Initial package creation |
| COMPENSATION_PACKAGE_APPROVED | **true** | COMPENSATION_PACKAGE | CFO/approver sign-off |
| HIRING_OFFER_CREATED | false | HIRING_OFFER | Offer record created |
| HIRING_OFFER_SENT | **true** | HIRING_OFFER | Offer dispatched to candidate |
| HIRING_OFFER_WITHDRAWN | **true** | HIRING_OFFER | Offer retracted |
| HIRING_APPROVAL_REQUESTED | false | HIRING_APPROVAL | Approval workflow initiated |
| HIRING_APPROVAL_RECORDED | **true** | HIRING_APPROVAL | Decision recorded (APPROVED / REJECTED) |
| CANDIDATE_ACCEPTANCE_RECORDED | **true** | HIRING_OFFER | Candidate response (ACCEPTED / DECLINED) |
| HIRING_DECISION_RECORDED | **true** | HIRING_DECISION | Final HIRED / NOT_HIRED outcome |

## FSMs

### Offer FSM
```
PENDING → SENT
PENDING → WITHDRAWN
SENT    → WITHDRAWN
```

### Compensation FSM
```
DRAFT → APPROVED
```

### Approval FSM
```
PENDING → APPROVED
PENDING → REJECTED
```

## Trust Ledger Rules

All events with `trust_sensitive: true` or `trust_level: HIGH` are automatically
appended to the immutable trust ledger by `trust_consumer`. The chain is maintained
via `prev_hash → entry_hash` SHA-256 linkage.

Sprint D trust-sensitive events (6 of 9):
- COMPENSATION_PACKAGE_APPROVED
- HIRING_OFFER_SENT
- HIRING_OFFER_WITHDRAWN
- HIRING_APPROVAL_RECORDED
- CANDIDATE_ACCEPTANCE_RECORDED
- HIRING_DECISION_RECORDED

## SQL Migration

`app/storage/migrations/20260307_sprint_d_sovereign_hiring.sql`

Tables created:
- `compensation_packages`
- `hiring_offers`
- `hiring_approvals`
- `candidate_acceptances`
- `hiring_decisions`

## API Routes

`app/api/hiring_router.js` — `createHiringRouter({ hiring })`

| Method | Path | Handler |
|--------|------|---------|
| POST | /hiring/compensation/draft | compensationService.draftPackage |
| POST | /hiring/compensation/approve | compensationService.approvePackage |
| GET  | /hiring/compensation | compensationService.listPackages |
| POST | /hiring/offers | offerService.createOffer |
| POST | /hiring/offers/send | offerService.sendOffer |
| POST | /hiring/offers/withdraw | offerService.withdrawOffer |
| GET  | /hiring/offers | offerService.listOffers |
| POST | /hiring/approvals/request | approvalService.requestApproval |
| POST | /hiring/approvals/record | approvalService.recordApproval |
| GET  | /hiring/approvals | approvalService.listApprovals |
| POST | /hiring/acceptance | acceptanceService.recordAcceptance |
| GET  | /hiring/acceptance | acceptanceService.listAcceptances |
| POST | /hiring/decisions | decisionService.recordDecision |
| GET  | /hiring/decisions | decisionService.listDecisions |

## Test Coverage

| File | Describes | Tests |
|------|-----------|-------|
| hiring.compensation_service.test.js | draftPackage, approvePackage, getPackage/listPackages | 8 |
| hiring.offer_service.test.js | createOffer, sendOffer, withdrawOffer, get/list | 12 |
| hiring.approval_service.test.js | requestApproval, recordApproval, get/list | 11 |
| hiring.acceptance_service.test.js | recordAcceptance, get/list | 8 |
| hiring.decision_service.test.js | recordDecision, get/list | 9 |
| hiring.router.test.js | all routes + 404 | 12 |
| hiring.trust_integration.test.js | trust ledger routing + chain integrity | 7 |

## Evidence Pack Template
EP-WOS-HIRING-01

## Compliance Notes
- All HIGH trust events require `requires_approval: true` in envelope
- Compensation packages must carry positive `base_salary`
- Currency defaults to SAR per KSA sovereign mandate
- Offer FSM enforces immutable withdrawal (no re-send after withdrawal)
- Approval FSM enforces single-decision (PENDING → terminal state only)
