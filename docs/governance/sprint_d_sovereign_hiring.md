# PROWORK — Sprint D / Sovereign Hiring (Canonical)

## Status
COMPLETE

## Baseline
- Phase 1: 5ff7de2
- Sprint A (WOS Core): f53327c
- Sprint B (Sovereign Recruiting): b5c8a62
- Sprint C (Sovereign Onboarding): 391db4a

## Scope
Full hiring lifecycle for the KSA sovereign context:
- Hiring case orchestration
- Compensation validation
- Approval chain
- Offer lifecycle
- Candidate acceptance
- Contract mirror mapping (Qiwa integration)

| Service | Operations | Trust Level |
|---------|-----------|-------------|
| hiring_case_service | openHiringCase, recordDecision | recordDecision → HIGH |
| compensation_service | validateCompensation | STANDARD |
| approval_service | requestApproval, approveOffer | approveOffer → HIGH |
| offer_service | draftOffer, sendOffer | STANDARD |
| acceptance_service | acceptOffer, declineOffer | acceptOffer → HIGH |
| qiwa_mapping_service | mapContract | HIGH |

## Events Registered (Sprint D)

| Event | aggregate_type | trust_sensitive | Notes |
|-------|---------------|-----------------|-------|
| HIRING_CASE_OPENED | HIRING_CASE | false | Case opened for candidate |
| HIRING_DECISION_RECORDED | HIRING_CASE | **true** | Final HIRED / NOT_HIRED |
| OFFER_DRAFTED | OFFER | false | Offer package created |
| OFFER_COMPENSATION_VALIDATED | OFFER | false | Gross salary computed |
| OFFER_APPROVAL_REQUESTED | HIRING_CASE | false | Approval workflow initiated |
| OFFER_APPROVED | HIRING_CASE | **true** | Approver sign-off |
| OFFER_SENT | OFFER | false | Offer dispatched |
| OFFER_ACCEPTED | OFFER | **true** | Candidate accepts |
| OFFER_DECLINED | OFFER | false | Candidate declines |
| CONTRACT_MIRROR_MAPPED | HIRING_CASE | **true** | Qiwa parity score |
| HIRING_CONTRACT_SIGNED | HIRING_CASE | **true** | Reserved — future sprint |
| HIRING_CONTRACT_ACTIVATED | HIRING_CASE | **true** | Reserved — future sprint |

> Note: `CONTRACT_SIGNED` / `CONTRACT_ACTIVATED` are owned by onboarding (aggregate: ONBOARDING_CASE).
> Hiring uses `HIRING_CONTRACT_SIGNED` / `HIRING_CONTRACT_ACTIVATED` to avoid namespace collision.

## Qiwa Parity Scoring
- `role_title` present → parity 100
- `role_title` missing → parity 60, `missing: ['role_title']`

## SQL Migration
`app/storage/migrations/20260307_sprint_d_sovereign_hiring.sql`
Tables: hiring_cases, offer_packages, offer_allowances, hiring_approvals, candidate_acceptances, contract_mappings

## API Routes
| Method | Path | Handler |
|--------|------|---------|
| POST | /hiring/cases | hiringCaseService.openHiringCase |
| POST | /hiring/cases/decision | hiringCaseService.recordDecision |
| GET  | /hiring/cases | hiringCaseService.listCases |
| POST | /hiring/compensation/validate | compensationService.validateCompensation |
| POST | /hiring/approvals/request | approvalService.requestApproval |
| POST | /hiring/approvals/approve | approvalService.approveOffer |
| GET  | /hiring/approvals | approvalService.listApprovals |
| POST | /hiring/offers | offerService.draftOffer |
| POST | /hiring/offers/send | offerService.sendOffer |
| GET  | /hiring/offers | offerService.listOffers |
| POST | /hiring/acceptance/accept | acceptanceService.acceptOffer |
| POST | /hiring/acceptance/decline | acceptanceService.declineOffer |
| POST | /hiring/qiwa/map | qiwaMappingService.mapContract |

## Test Coverage: 65 tests, 0 failures
hiring.case.test.js · hiring.compensation.test.js · hiring.approval.test.js · hiring.offer.test.js · hiring.acceptance.test.js · hiring.qiwa_mapping.test.js · hiring.router.test.js · hiring.trust_integration.test.js

## Evidence Pack Template
EP-WOS-HIRING-01
