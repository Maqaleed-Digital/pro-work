# WORKCAPTAIN — CONTINUOUS COMPLIANCE CONTROL MODEL

Status: ACTIVE  
Authority: Phase 64

## 1. Inputs
- current runtime state
- latest route measurements
- linked Phase 62 evidence
- linked Phase 63 evidence

## 2. Compliance Decision Rules
- continuous compliance is ACTIVE when runtime continuity is valid and prior evidence chain is intact
- continuous compliance is WARNING when runtime continuity is valid but route posture is near threshold
- continuous compliance is ESCALATED when prior escalation exists or current route posture breaches warning-safe posture
- continuous compliance is BLOCKED when required evidence linkage or runtime continuity is invalid

## 3. Automation Readiness
Automation readiness is:
- `READY` when loop state is operational or warning
- `REVIEW_REQUIRED` when loop state is escalated
- `BLOCKED` when loop state is blocked

## 4. Source-of-Truth Rule
All loop decisions must reference:
- pushed commit hash
- current evidence directory
- linked Phase 62 evidence directory
- linked Phase 63 evidence directory
