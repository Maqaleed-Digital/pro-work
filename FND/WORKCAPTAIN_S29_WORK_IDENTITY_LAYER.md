# WORKCAPTAIN — S29 WORK IDENTITY LAYER

Version: 1.0
Status: LOCKED FOR EXECUTION
Baseline Commit: 4453f54
Applies From: Sprint S29

---

## 1. PURPOSE

S29 activates the Work Identity Layer as the next platform moat after S28 externalization.

The goal is to transform operational trust signals into portable identity primitives.

S29 introduces three governed capabilities:

- Identity Tokens
- Identity Graph
- Identity API

This sprint does not replace ERI.
It operationalizes ERI and related trust signals into identity-facing structures.

---

## 2. STRATEGIC POSITION

WorkCaptain's architecture is:

- Workforce OS
- Execution Engine
- Trust Engine
- Work Identity Network

S29 is the sprint where Work Identity stops being conceptual and becomes productized.

The sprint must preserve:
- existing runtime behavior
- existing evidence and audit discipline
- existing compliance surfaces
- existing human approval controls

---

## 3. S29 TARGET STATE

At S29 closure, WorkCaptain must support:

### 3.1 Identity Tokens
Work-derived, auditable token records generated from trusted platform events.

Initial token classes:
- PROJECT_COMPLETION_TOKEN
- PHR_APPROVAL_TOKEN
- COMPLIANCE_VERIFICATION_TOKEN
- TEAM_LEADERSHIP_TOKEN

Each token must include:
- token id
- worker id / owner id
- token class
- source event reference
- evidence reference if applicable
- issuance timestamp
- status

### 3.2 Identity Graph
A first governed relationship graph showing worker-to-worker and worker-to-work relationships.

Initial graph relation classes:
- WORKED_WITH
- LED_TEAM
- COMPLETED_PROJECT
- APPROVED_OUTPUT
- PASSED_COMPLIANCE

The graph may start as an application-level derived model and does not require deep graph infrastructure in S29.

### 3.3 Identity API
Minimum enterprise-safe API surfaces for:
- listing identity tokens
- listing worker identity summaries
- listing graph relationships
- reading identity detail for a worker

---

## 4. S29 SCOPE

### 4.1 In Scope

1. Token issuance logic from existing trusted signals
2. Identity token persistence model
3. Identity token visibility in product
4. Identity graph derived model
5. Identity graph visibility in product
6. Identity API routes
7. Identity audit / evidence references
8. Identity-ready extensions to existing /identity surface

### 4.2 Out of Scope

1. blockchain or external credential networks
2. marketplace token transferability
3. public anonymous identity exposure
4. external federation with third-party identity systems
5. deep graph database migration
6. monetization packaging of tokens

---

## 5. TOKEN ISSUANCE RULES

### 5.1 Hard Rules
1. No token without source evidence or source event reference.
2. No token issuance from low-confidence AI-only suggestion.
3. No token issuance that bypasses human-reviewed trust conditions where required.
4. Token issuance must be replay-safe and idempotent.
5. Token state changes must be auditable.

### 5.2 Initial Issuance Triggers
The following triggers are permitted in S29:

- completed project or milestone with trusted completion path
- approved human review / PHR event
- verified compliance resolution such as WPS / consent / governance-linked completion
- verified team leadership contribution when existing records support it

### 5.3 Minimum Token Fields
- id
- token_type
- owner_worker_id
- source_type
- source_id
- evidence_ref
- status
- issued_at
- metadata

---

## 6. IDENTITY GRAPH RULES

### 6.1 Initial Graph Construction
Graph edges must be derived from already-trusted system records.

Examples:
- worker A worked with worker B on project X
- worker A led worker B on assignment Y
- worker A received approved review on milestone Z
- worker A passed compliance state C

### 6.2 Graph Constraints
- graph data must remain tenant-safe
- graph edges must remain explainable
- graph generation must be deterministic
- graph must be rebuildable from trusted records

---

## 7. IDENTITY API CONTRACT

Minimum API surfaces:

- GET /api/identity/summary
- GET /api/identity/tokens
- GET /api/identity/tokens/:id
- GET /api/identity/graph
- GET /api/identity/workers/:workerId

Minimum requirements:
- role-aware access
- tenant-safe filtering
- predictable JSON structures
- audit-safe fields only
- no sensitive raw documents in payloads

---

## 8. UI / PRODUCT CONTRACT

The /identity route must evolve from placeholder visibility into an identity operating surface.

Required visible sections:

1. Identity Summary
- total tokens
- token class counts
- ERI-linked status
- verified worker count

2. Worker Identity Table
- worker
- ERI
- token count
- compliance badge
- approvals / trusted completions
- identity health

3. Token Explorer
- token type
- owner
- status
- issued at
- source reference

4. Relationship Graph View
- initial visual or structured relation panel
- relation type visibility
- source-backed explainability

5. Identity API Readiness card
- API endpoints available
- role boundary note
- tenant-safe statement

---

## 9. ACCEPTANCE GATES

### S29-G1 Token Model
Token schema and issuance pathway exist and are wired to trusted system data.

### S29-G2 Token Visibility
Identity tokens are visible in-product and linked to source references.

### S29-G3 Graph Model
Identity graph or relationship model exists and is visible in-product.

### S29-G4 API Surface
Identity API routes exist and return structured, tenant-safe responses.

### S29-G5 Explainability
Token and graph derivations are explainable via source-backed references.

### S29-G6 Governance
Identity issuance and access remain evidence-backed, auditable, and human-governed.

### S29-G7 Closure
Evidence updated, closure recorded, pushed commit becomes sole source of truth.

---

## 10. REQUIRED EVIDENCE

Each S29 run must generate:

- EXECUTION_STATUS.txt
- TOKEN_MODEL_MATRIX.md
- TOKEN_ISSUANCE_MATRIX.md
- IDENTITY_GRAPH_MATRIX.md
- IDENTITY_API_MATRIX.md
- IDENTITY_UI_MATRIX.md
- EXPLAINABILITY_MATRIX.md
- GOVERNANCE_CLOSURE.md

---

## 11. IMPLEMENTATION DIRECTION

### 11.1 Minimal Durable Design
Prefer app-level durable structures that fit the current repo and runtime over premature deep microservice splits.

### 11.2 Trust-to-Identity Conversion
Treat S29 as a derived layer:
Trust signals remain primary.
Identity structures are derived from them.

### 11.3 Product Value
The sprint must make identity:
- visible
- defensible
- exportable at API level
- explainable to enterprise stakeholders

---

## 12. SUCCESS DEFINITION

S29 is successful only if WorkCaptain can demonstrate that trusted work activity becomes explainable professional identity.
