# S43 Sprint Closure Summary
Sprint: S43 — Job Posting + Candidate Pipeline
Base: integration/post-s42 (0ae7d3a)
Branch: sprint/S43-job-posting-candidate-pipeline
Date: 2026-04-19

---

## Gate Register

| Gate | Description | Commit | Tests | Closed |
|------|-------------|--------|-------|--------|
| G1 | Requisition schema + API | 4af0d5f | 27 | PASS |
| G2 | Job posting UI (#post-role) | d084be6 | 23 | PASS |
| G3 | Candidate/applicant schema | 99f23b9 | 25 (24+1 integ) | PASS |
| G4 | AI candidate matching | 7f255dd | 24 (23+1 integ) | PASS |
| G5 | Candidate pipeline UI (#candidates) | 54506a7 | 21 + smoke | PASS |
| G6 | Offer builder UI (#offer-builder) | 52a43f0 | 35 (18+16+1 integ) | PASS |
| G7 | Sprint closure + EP-WOS-RECRUIT-01 | (this commit) | 6 (5+1 integ) | PENDING |

## Cumulative Test Totals

- Hiring tests: 101
- Frontend tests: 60
- Integration tests (live Cloud SQL): 5
- **Total S43 tests: 166**

## Migrations Applied to Production

| Migration | Tables | Applied |
|-----------|--------|---------|
| 20260418_create_requisitions.sql | requisitions, requisition_skills, requisition_documents | Yes |
| 20260419_create_candidates.sql | candidates, applications, application_events | Yes |
| 20260419_create_offers.sql | offers | Yes |
| fix_audit_log_review_grant | column-level UPDATE on recommendation_audit_logs | Yes |

## New Services

| Service | File |
|---------|------|
| requisition_service | app/modules/hiring/requisition_service.js |
| candidate_service | app/modules/hiring/candidate_service.js |
| application_service | app/modules/hiring/application_service.js |
| ai_matching_service | app/modules/hiring/ai_matching_service.js |
| bias_monitor | app/modules/hiring/bias_monitor.js |
| offer_service | app/modules/hiring/offer_service.js |

## New API Routers

| Router | File | Endpoints |
|--------|------|-----------|
| requisition_router | app/api/requisition_router.js | 12 endpoints |
| offer_router | app/api/offer_router.js | 5 endpoints |

## New Frontend Pages

| Page | Route | File |
|------|-------|------|
| Post a Role | #post-role | app/frontend/src/pages/post_role.js |
| Candidates | #candidates | app/frontend/src/pages/candidates.js |
| Offer Builder | #offer-builder | app/frontend/src/pages/offer_builder.js |

## New Config Files

| Config | File |
|--------|------|
| Requisition validation | app/config/hiring/requisition_validation.json |
| Application state machine | app/config/hiring/application_state_machine.json |
| AI matching rubric | app/config/ai/matching_rubric_v1.json |

## BRD Traceability

| Requirement | Source | Gate |
|-------------|--------|------|
| Nitaqat preview before publish | WOS §7.1 | G1 (409 on missing preview) |
| Occupation code validation | WOS §7.2 | G1 (prohibited codes blocked) |
| RecommendationAuditLog (BINDING) | Gold BRD §A4 | G4 (every candidate logged) |
| Human-in-the-loop guardrails | WOS §11.2 | G4 (PENDING → ACCEPTED/REJECTED) |
| Evidence logging for AI | WOS §11.3 | G4+G7 (audit log + evidence pack) |
| Explainability UI | RT-1 §5.2 | G5 (explanation panel) |
| Bias monitoring | RT-1 §8.2 | G4 (disparate impact ratios) |
| Fee transparency + 0% commission | Eval §Pricing | G6 (structural badge) |
| Immutable audit layer | Gold BRD §A7 | G3 (application_events append-only) |
| RTL-first Arabic | Gold BRD §A6 | G2, G5, G6 (294 EN+AR keys) |
| EP-WOS-RECRUIT-01 | WOS Appendix | G7 (auto-generated on HIRED/REJECTED) |

## Deferred Items

| Item | Justification |
|------|---------------|
| Qiwa API integration | Requires MOL sandbox access (external dependency) |
| Email notifications on offer sent | Email service not yet provisioned (S44 scope) |
| Real-time Kanban websocket updates | HTTP polling adequate for beta (S45 scope) |
| FREELANCER escrow payment integration | Requires PSP (Tap/HyperPay) — deferred from S40 |

## Cloud Run Revision History

| Revision | Gate | Notes |
|----------|------|-------|
| api-service-00039-grn | G2 | Post-role page deployed |
| api-service-00040-jz2 | G5 | Candidates pipeline deployed |
| api-service-00041-fj2 | G6 | Offer builder deployed |

## End-to-End Lineage Artifacts

| Artifact | ID | Status |
|----------|----|--------|
| Seed requisition | 1da8dc6c-1e7d-404b-bef0-396163518c59 | PUBLISHED |
| G3 application | c8fd9992-0ea8-4773-9d09-bec51bcfd3c8 | HIRED |
| G4 application | 016e6d82-2098-47bd-8bc9-afc56845ee97 | OFFERED |
| G4 audit log | 263ad170-64d7-4aa5-bbb2-ddc9aec8a3d2 | ACCEPTED |
| G6 offer | 5fef978a-4eb3-4334-9ad0-eea101dd9bcc | SENT |
| G7 evidence pack | 5c280698-8608-4598-821e-5d476d88897c | CLOSED |
| G7 pack hash | 1eabd48187eb54727928d04371799632 | immutable |

## Branch Discipline

- Base: integration/post-s42 at 0ae7d3a
- Sprint branch: sprint/S43-job-posting-candidate-pipeline
- All commits on sprint branch
- Merge-back to integration/post-s43: PENDING (human-only)
