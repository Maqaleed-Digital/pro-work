# WORKCAPTAIN — S30 COMMERCIAL ACTIVATION LAYER

Version: 1.0
Status: LOCKED FOR EXECUTION
Baseline Commit: 0c038d7
Applies From: Sprint S30

---

## 1. PURPOSE

S30 activates the commercial layer of WorkCaptain.

The platform is already operational, externally visible, and identity-enabled.
S30 converts that readiness into a revenue-capable operating surface.

This sprint introduces three governed commercial capabilities:

- Revenue Activation
- Onboarding Activation
- PSP Readiness Path

S30 does not attempt full financial expansion.
It establishes the minimum durable commercial path required to onboard and convert real customers.

---

## 2. STRATEGIC POSITION

S30 sits after:

- S28 — Externalization Layer
- S29 — Work Identity Layer

S30 turns product readiness into commercial readiness.

The sprint must preserve:
- existing runtime behavior
- existing evidence and audit discipline
- existing sovereign compliance surface
- existing human approval controls
- existing trust and identity layers

---

## 3. S30 TARGET STATE

At S30 closure, WorkCaptain must support:

### 3.1 Revenue Activation
Visible commercial surfaces for:
- pricing visibility
- fee disclosure
- payout/escrow path visibility
- commercial CTA readiness
- conversion-safe route flow

### 3.2 Onboarding Activation
Operational onboarding paths for:
- employer / client onboarding
- workforce / worker onboarding
- platform readiness handoff
- guided first-use activation

### 3.3 PSP Readiness Path
A governed PSP activation layer supporting:
- PSP selection surface
- staged integration readiness
- payout / escrow state visibility
- fee and commercial policy visibility
- provider path abstraction without false "live" claims

---

## 4. S30 SCOPE

### 4.1 In Scope

1. Commercial activation model
2. Pricing / fee surface
3. Revenue-readiness UI
4. Employer onboarding surface
5. Worker onboarding surface
6. PSP readiness surface
7. Commercial API or config readiness where needed
8. Evidence-backed commercial activation status

### 4.2 Out of Scope

1. Full PSP deep production rollout across all providers
2. Final enterprise billing automation
3. Full accounting / ERP integration
4. Full settlement engine redesign
5. Tax engine or payroll execution
6. Cross-border treasury optimization

---

## 5. COMMERCIAL ACTIVATION RULES

### 5.1 Hard Rules
1. Do not represent staged PSPs as fully live if they are not.
2. Do not hide fees or commercial conditions.
3. Do not bypass evidence creation for commercial state changes.
4. Do not ship onboarding flows without clear next-step states.
5. Do not regress existing payments, compliance, trust, or identity surfaces.

### 5.2 Minimum Commercial Disclosures
WorkCaptain must visibly disclose:
- pricing intent or package structure
- fee path or staged fee model
- payout / escrow operational status
- PSP staging status
- onboarding readiness state

### 5.3 Activation Principle
S30 is successful when a commercial stakeholder can understand:
- what WorkCaptain sells
- how onboarding starts
- how payment path works
- what is live vs staged
- what the next activation step is

---

## 6. ONBOARDING RULES

### 6.1 Employer / Client Onboarding
Must support a first commercial path including:
- company setup entry
- operating profile capture
- compliance-aware onboarding framing
- next-step activation state

### 6.2 Worker / Workforce Onboarding
Must support a first path including:
- identity/compliance expectations
- payout readiness expectations
- work/identity linkage expectations

### 6.3 Onboarding Constraints
- onboarding must remain tenant-safe
- onboarding must remain explainable
- onboarding must expose state, not hide it
- onboarding should support staged progression rather than fake completion

---

## 7. PSP PATH RULES

### 7.1 PSP Strategy Surface
S30 must make PSP readiness visible using a staged model.

Minimum tracked providers:
- Stripe
- Tap
- HyperPay

Optional staged references:
- PayTabs
- Payoneer
- Wise

### 7.2 PSP State Model
Minimum states:
- PLANNED
- STAGED
- READY_FOR_INTEGRATION
- LIVE

No provider may be marked LIVE without real implemented proof.

### 7.3 Commercial Path Requirements
The product must expose:
- provider path
- payout/escrow stage
- fee path
- readiness state
- next recommended action

---

## 8. UI / PRODUCT CONTRACT

S30 must introduce or complete the following visible product surfaces:

### 8.1 Revenue Surface
Required sections:
- pricing / package summary
- fee disclosure card
- commercial readiness strip
- payout / escrow state summary
- PSP readiness panel
- conversion CTA panel

### 8.2 Employer Onboarding Surface
Required sections:
- onboarding steps
- organization / profile state
- compliance activation prompts
- payment path prompts
- activation completion status

### 8.3 Worker Onboarding Surface
Required sections:
- identity readiness
- payout readiness
- compliance readiness
- trust / identity linkage visibility
- onboarding state

### 8.4 Payments / PSP Extension
Existing payments surface must evolve to show:
- staged PSP matrix
- payout path readiness
- escrow readiness
- fee path transparency
- next activation action

---

## 9. API / CONFIG CONTRACT

Minimum durable commercial structures may include:
- pricing config
- onboarding config/state
- PSP readiness config/state
- conversion / activation summaries

If APIs are added, they must be:
- tenant-safe
- role-aware
- audit-safe
- explicit about staged vs live state

---

## 10. ACCEPTANCE GATES

### S30-G1 Revenue Surface
Pricing, fees, payout/escrow state, and commercial readiness are visible in-product.

### S30-G2 Employer Onboarding
Employer onboarding path exists and is visibly stateful.

### S30-G3 Worker Onboarding
Worker onboarding path exists and is visibly stateful.

### S30-G4 PSP Path
PSP readiness matrix/path exists and distinguishes staged vs live states.

### S30-G5 Explainability
Commercial state, onboarding state, and PSP state are clearly explained.

### S30-G6 Governance
Commercial activation remains evidence-backed, audit-safe, and human-governed.

### S30-G7 Closure
Evidence updated, closure recorded, pushed commit becomes sole source of truth.

---

## 11. REQUIRED EVIDENCE

Each S30 run must generate:

- EXECUTION_STATUS.txt
- REVENUE_SURFACE_MATRIX.md
- EMPLOYER_ONBOARDING_MATRIX.md
- WORKER_ONBOARDING_MATRIX.md
- PSP_PATH_MATRIX.md
- COMMERCIAL_API_MATRIX.md
- EXPLAINABILITY_MATRIX.md
- GOVERNANCE_CLOSURE.md

---

## 12. IMPLEMENTATION DIRECTION

### 12.1 Minimal Durable Commercial Design
Prefer durable productized structures that fit the current runtime and UI rather than speculative billing architecture.

### 12.2 Truthful Activation
Every surface must tell the truth about readiness, staging, and next action.

### 12.3 Product Value
S30 must make WorkCaptain:
- commercially legible
- onboarding-ready
- payment-path credible
- revenue-activation ready

---

## 13. SUCCESS DEFINITION

S30 is successful only if a real customer can understand how to start, how WorkCaptain commercializes, and how payments/onboarding are meant to activate without ambiguity.
