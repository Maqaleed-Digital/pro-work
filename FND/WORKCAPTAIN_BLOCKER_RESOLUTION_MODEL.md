# WORKCAPTAIN BLOCKER RESOLUTION MODEL

## Principles
- Evidence-first
- Deterministic
- Fail-closed
- Human-approval-required
- No unsupported closure

## Resolution States
- OPEN
- IN_PROGRESS
- EVIDENCE_SUBMITTED
- RESOLVED
- REJECTED

## Validation Rule
A blocker may be marked RESOLVED only if:
- closure evidence exists
- closure evidence is explicitly referenced
- validation passes
- approval posture remains human-authorized

## Readiness Rule
Certification rerun readiness is TRUE only when all blockers are RESOLVED and validated.
