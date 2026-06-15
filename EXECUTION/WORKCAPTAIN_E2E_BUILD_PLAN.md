# WorkCaptain.ai — End-to-End Build Plan
Version 1.0 | April 2026 | Status: ACTIVE
Authority: Waheeb Mahmoud
Base: S36–S42 CLOSED (all gates PASS)

---

## SPRINT S43 — Job Posting + Candidate Pipeline

Objective: Employer can post a role, see Nitaqat
impact before publishing, and manage a candidate
pipeline through to offer.

### S43 Gate Structure

| Gate | Description |
|------|-------------|
| S43-G1 | Requisition schema + API |
| S43-G2 | Job posting UI (#post-role) |
| S43-G3 | Candidate / applicant schema |
| S43-G4 | AI candidate matching |
| S43-G5 | Candidate pipeline UI (#candidates) |
| S43-G6 | Offer builder UI (#offer-builder) |
| S43-G7 | Sprint closure + EP-WOS-RECRUIT-01 |

---

### S43-G1 Deliverables

- app/storage/migrations/20260418_create_requisitions.sql
  requisitions, requisition_skills, requisition_documents
  tables. RLS enforced. prowork_app: INSERT / SELECT /
  UPDATE(status, filled_at). REVOKE DELETE.

- app/modules/hiring/requisition_service.js
  createRequisition(), publishRequisition(),
  closeRequisition(), getRequisitionWithNitaqatPreview()

- app/api/requisition_router.js
  POST   /api/hiring/requisitions
  GET    /api/hiring/requisitions
  PATCH  /api/hiring/requisitions/:id
  POST   /api/hiring/requisitions/:id/publish

- tests/hiring/requisition_service.test.js
  Minimum 20 tests. Must cover:
  - Nitaqat preview fires on create
  - Prohibited occupation codes blocked
  - Salary range validation
  - Status transitions

Constraint: Nitaqat impact preview must fire BEFORE
role is published. Publish endpoint rejects with 409
if preview not run in same session.

---

### S43-G2 Deliverables — Job Posting UI

- app/frontend/src/pages/post_role.js
  4-step vanilla JS form:
  Step 1: Role basics (title, department,
    contract type: FTE / FREELANCER / AI_EXECUTABLE)
  Step 2: Requirements (skills, experience,
    occupation code with AI suggestion from S36-G4)
  Step 3: Compensation (salary range, allowances,
    GOSI estimate — uses compensation_policy_service)
  Step 4: Nitaqat impact preview
    (POST /api/admin/compliance/nitaqat/preview
    with hire scenario) then publish button

- Wire into router.js as #post-role.
- Add to nav under Workers section.
- Requires HIRING_MANAGER permission.
- Arabic RTL labels on all 4 steps.

---

### S43-G3 Deliverables — Candidate Schema

- app/storage/migrations/20260418_create_candidates.sql
  candidates, applications, application_events tables.
  Status machine:
  APPLIED → SCREENING → SHORTLISTED → INTERVIEWED
  → OFFERED → HIRED / REJECTED

---

### S43-G4 Deliverables — AI Candidate Matching

- app/modules/hiring/ai_matching_service.js
  rankCandidates(requisitionId) — calls existing
  talent_marketplace_service with S36-G1 audit log
  wiring. Returns ranked list with confidence scores
  and explanation. Every recommendation logged to
  recommendation_audit_logs with input signals,
  rationale, confidence, timestamp, bias score.

---

### S43-G5 Deliverables — Candidate Pipeline UI

- app/frontend/src/pages/candidates.js
  Kanban pipeline UI. Each card:
  - Candidate name
  - ERI score badge
  - Match %
  - AI explanation expandable
  Drag between columns triggers status update
  via PATCH /api/hiring/applications/:id/status.

---

### S43-G6 Deliverables — Offer Builder UI

- app/frontend/src/pages/offer_builder.js
  Three-path decision UI:
  - FTE: full compensation form + GOSI + Qiwa fields
  - FREELANCER: milestone-based, escrow terms,
    0% commission badge (non-negotiable, always visible)
  - AI_EXECUTABLE: delivery window definition,
    outcome criteria
  Pre-offer compliance preview:
  GREEN / AMBER / RED checks visible before send.
  Uses fee_transparency_policy_v1.json for fee math.

---

### S43-G7 — Sprint Closure

- Wire EP-WOS-RECRUIT-01 to fire automatically
  when a candidate evaluation is completed
  (shortlisted or rejected with reason).
- Evidence pack generates all 8 schema fields
  per S38-G2.
- Manual sprint closure required (human-only).

S43 STATUS: CLOSED — April 19, 2026
Authority: Waheeb Mahmoud
166 tests. 11 commits. 7/7 gates PASS.
integration/post-s43 at 8f4f6ae.

---

## SPRINT S44 — Contract Builder + Lifecycle

Objective: Employer can build contracts from accepted
offers, manage WPS readiness, probation governance,
ESB lifecycle, offboarding workflow, and SDP programs.

### S44 Gate Structure

| Gate | Description |
|------|-------------|
| S44-G1 | Contract builder UI (#contracts) |
| S44-G2 | WPS checklist UI in admin |
| S44-G3 | Probation dashboard (#probation) |
| S44-G4 | ESB calculator screen (#lifecycle) |
| S44-G5 | Offboarding workflow UI |
| S44-G6 | SDP program workspace UI (#programs) |
| S44-G7 | Sprint closure + evidence pack audit (MANUAL) |

---

### S44-G1 Deliverables — Contract Builder UI

- app/frontend/src/pages/contracts.js
  Route: #contracts
  Converts accepted offers (status ACCEPTED) into
  Qiwa-ready contract records. Three contract paths
  matching offer types: FTE / FREELANCER / AI_EXECUTABLE.
  - FTE: full employment contract with probation,
    GOSI, WPS fields, notice period
  - FREELANCER: milestone-based service agreement,
    escrow terms, 0% commission badge visible
  - AI_EXECUTABLE: service delivery agreement with
    outcome criteria, escalation thresholds
  Compliance preview (GREEN/AMBER/RED) before signing.
  EP auto-generates on contract signed (terminal state).

- Migration: app/storage/migrations/20260420_create_contracts.sql
  contracts table with RLS, column-level UPDATE, no DELETE.

- Service: app/modules/hiring/contract_service.js
  createContract(), signContract(), terminateContract()

- RBAC: HIRING_MANAGER permission required.
- Arabic RTL labels throughout.

---

### S44-G2 Deliverables — WPS Checklist UI

- Integration of existing S37-G1 WPS readiness service
  into admin UI at #wps-readiness or within #contracts.
- Checklist items rendered from wps_readiness_service.
- Progress bar showing completion percentage.
- Items update via existing PATCH endpoints.
- MANAGE_COMPLIANCE permission required.

---

### S44-G3 Deliverables — Probation Dashboard

- app/frontend/src/pages/probation.js
  Route: #probation
  Shows all employees in probation period:
  - Days elapsed / days remaining
  - Day-80 pack generation trigger
  - Probation decision: CONFIRM / EXTEND / TERMINATE
  - Decision triggers EP-WOS-PROBATION-01 evidence pack.
  Uses existing S37-G2 probation_governance_service.
  MANAGE_PROBATION permission required.

---

### S44-G4 Deliverables — ESB Calculator Screen

- app/frontend/src/pages/lifecycle.js
  Route: #lifecycle
  End-of-service benefit calculator:
  - Salary, years of service, termination type
  - KSA Labor Law Article 84/85 calculation
  - ESB breakdown: first 5 years (half), remaining
    (full) per Article 84
  Uses existing S37-G6 ESB service.
  VIEW_ESB + APPROVE_ESB permissions.

---

### S44-G5 Deliverables — Offboarding Workflow UI

- app/frontend/src/pages/offboarding.js
  Route: #offboarding
  Offboarding checklist and workflow:
  - Asset return tracking
  - Final settlement calculation
  - Exit interview record
  - Clearance approvals chain
  EP-WOS-OFFBOARD-01 auto-generates on completion.
  Uses existing S38-G4/G5 offboarding services.

---

### S44-G6 Deliverables — SDP Program Workspace

- app/frontend/src/pages/programs.js
  Route: #programs
  Saudi Development Program workspace:
  - Program creation and enrolment
  - Progress tracking per enrolled employee
  - Completion certificates
  Uses existing S38-G7 SDP service.
  MANAGE_COMPLIANCE permission required.

---

### S44-G7 — Sprint Closure

- Evidence pack audit: verify EP generation for all
  terminal states across hiring, probation, offboarding.
- Cumulative test count across S44.
- Manual sprint closure required (human-only).

### S44 Standing Constraints (inherited)

- EP auto-generates on every terminal state
- Arabic RTL parity maintained
- RBAC enforced per screen
- AMBER advisory / RED blocking semantics
- Update-resets-to-DRAFT pattern where applicable
- All policy rules in versioned JSON config
- Design system CSS variables from S42 throughout
