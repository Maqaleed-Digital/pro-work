# WORKCAPTAIN — S28 IMPLEMENTATION PROMPT

Use this prompt with Claude Code as the implementation executor.

---

Continue from the latest verified WorkCaptain baseline.

Sprint:
S28 — Unified P0 Gap Closure / Externalization Layer

Objective:
Close all remaining P0 platform gaps in one governed execution layer without changing the underlying architecture.

Baseline truths:
- Runtime system is active
- Scheduler, ERI, evidence, audit, WPS, consent governance already exist
- The main gap is external visibility, explainability, compliance surfacing, evidence surfacing, financial surfacing, and privacy-operational surfacing

Implement the following in one coherent execution pass:

1. Command Center route /
- KPI strip
- risk strip
- AI strip
- compliance strip
- evidence strip
- quick actions
- role-aware navigation

2. AI Control route /ai
- recommendation cards
- rationale
- confidence
- reviewer action controls
- override capture
- immutable audit reference display

3. Compliance route /compliance
- WPS readiness
- probation status / deadlines
- compliance alerts
- consent / PDPL visibility
- sovereign summary widgets

4. Evidence route /evidence
- evidence pack index
- evidence detail panel
- audit timeline
- export action entry
- AI artifact references
- approval chain references

5. Payments route /payments
- escrow state
- payout state
- fee disclosure
- release status
- dispute / hold visibility

6. Identity route /identity
- ERI visibility
- identity placeholder for future tokenization
- verified history surface or placeholder cards if underlying data is partial

Cross-cutting rules:
- do not bypass existing governance
- do not remove existing runtime loops
- do not auto-close any gate
- keep actions explainable and visible
- add loading / empty / error states
- maintain Arabic/RTL readiness
- preserve evidence generation and audit integrity

Required outputs:
- code changes
- any migrations if needed
- tests if applicable
- evidence script or command notes
- closure summary
