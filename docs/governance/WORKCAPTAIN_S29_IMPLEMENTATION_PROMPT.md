# WORKCAPTAIN — S29 IMPLEMENTATION PROMPT

Use this prompt with Claude Code as the implementation executor.

---

Continue from the latest verified WorkCaptain baseline.

Sprint:
S29 — Work Identity Layer (Tokens + Graph + API)

Objective:
Implement the Work Identity Layer using the existing runtime, evidence, and trust model. Convert trusted work signals into visible identity structures without redesigning the platform.

Implement the following in one coherent execution pass:

1. Identity token model
- durable token structure
- token issuance from existing trusted records
- replay-safe / idempotent behavior
- source-backed issuance

2. Identity graph model
- initial derived relationship model
- worker-to-worker and worker-to-work relationships
- explainable source linkage

3. Identity API
- GET /api/identity/summary
- GET /api/identity/tokens
- GET /api/identity/tokens/:id
- GET /api/identity/graph
- GET /api/identity/workers/:workerId

4. Identity UI
- expand /identity into operational surface
- token explorer
- worker identity table
- relationship graph or structured relation panel
- API readiness section

Cross-cutting rules:
- do not change the core architecture
- do not bypass existing governance
- do not issue tokens from untrusted signals
- do not expose sensitive raw documents
- maintain role-aware / tenant-safe behavior
- add loading / empty / error states
- preserve Arabic/RTL readiness

Required outputs:
- code changes
- migrations if needed
- tests if applicable
- evidence notes
- closure summary
