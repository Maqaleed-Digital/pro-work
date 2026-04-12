# WORKCAPTAIN — AUTOMATED GOVERNANCE LOOP POLICY

Status: ACTIVE  
Authority: Phase 64

## 1. Principle
The governance loop must be evidence-driven, replayable, and safe to run repeatedly.

## 2. Loop Outputs
Every loop execution must produce:
- loop baseline
- continuous compliance status
- governance loop output
- loop actions
- automation readiness
- review snapshot
- gate result

## 3. Continuous Compliance States
- `COMPLIANCE_CONTINUOUS_ACTIVE`
- `COMPLIANCE_CONTINUOUS_WARNING`
- `COMPLIANCE_CONTINUOUS_ESCALATED`
- `COMPLIANCE_CONTINUOUS_BLOCKED`

## 4. Governance Loop States
- `LOOP_OPERATIONAL`
- `LOOP_WARNING`
- `LOOP_ESCALATED`
- `LOOP_BLOCKED`

## 5. Non-Negotiables
- no silent success
- no inferred continuity
- no automation success without fresh measurements
- no closure of escalated posture inside the execution script
- no mutation of production runtime by the governance loop
