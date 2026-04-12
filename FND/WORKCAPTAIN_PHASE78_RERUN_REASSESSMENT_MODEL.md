# WORKCAPTAIN PHASE 78 RERUN REASSESSMENT MODEL

## Principles
- Evidence-first
- Deterministic
- Fail-closed
- No unsupported upgrade
- Human-authority-final

## Reassessment States
- CERTIFIED
- CONDITIONALLY_CERTIFIED
- NOT_RESTORED

## Rerun Rule
If all blockers are resolved and rerun readiness is true, reassessment may proceed.

## Decision Rule
Final status must apply the full-certification thresholds to the accepted metric values from decision_defaults. If thresholds are not met, status must reflect that accurately.

## Hard Rule
No status uplift is valid unless the rerun evidence explicitly supports it.
Phase 84 governance acceptance records accepted conditions at CONDITIONALLY_CERTIFIED posture.
They do not constitute metric improvement.
