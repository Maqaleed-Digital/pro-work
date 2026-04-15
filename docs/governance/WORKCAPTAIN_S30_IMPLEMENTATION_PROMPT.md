# WORKCAPTAIN — S30 IMPLEMENTATION PROMPT

Use this prompt with Claude Code as the implementation executor.

---

Continue from the latest verified WorkCaptain baseline.

Sprint:
S30 — Commercial Activation Layer (Revenue + Onboarding + PSP path)

Objective:
Implement the commercial activation layer using the existing runtime, evidence, compliance, trust, and identity model. Make WorkCaptain commercially legible, onboarding-ready, and truthful about PSP readiness.

Implement the following in one coherent execution pass:

1. Revenue activation surface
- pricing/package visibility
- fee disclosure
- commercial readiness strip
- payout/escrow state summary
- conversion CTA surface

2. Employer onboarding path
- stateful onboarding flow or surface
- company/profile setup visibility
- compliance activation prompts
- next-step state tracking

3. Worker onboarding path
- identity readiness
- payout readiness
- compliance readiness
- onboarding state visibility

4. PSP readiness path
- staged PSP matrix
- staged vs live distinction
- next-action visibility
- payout / escrow / fee support visibility

5. Payments/commercial surface evolution
- extend current payments surface as needed
- preserve truthful staged-state display
- no false live claims

Cross-cutting rules:
- do not change the core architecture
- do not bypass governance
- do not misrepresent PSP state
- do not hide commercial terms
- maintain role-aware / tenant-safe behavior
- add loading / empty / error states
- preserve Arabic/RTL readiness

Required outputs:
- code changes
- migrations if needed
- tests if applicable
- evidence notes
- closure summary
