# WORKCAPTAIN RECOVERY SIGNAL MODEL

## Principles
- Evidence-first
- Deterministic
- Human-approval-only
- Coverage-disclosed
- No unsupported recovery claims

## Recovery Signal Families
- governance_degradation_driver
- critical_advisory_trigger
- evidence_completeness_gap
- cadence_instability_signal
- portfolio_coverage_gap
- portfolio_concentration_risk

## Recovery Priorities
- P0_IMMEDIATE
- P1_URGENT
- P2_CONTROLLED
- P3_MONITOR

## Required Mapping Rule
Every remediation item must map:
driver -> metric -> threshold -> evidence source -> remediation action -> approval posture

## Recovery Output Rule
No recovery status may be marked restored unless supported by future persisted evidence.
