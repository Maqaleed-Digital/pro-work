# WORKCAPTAIN — OPERATIONAL GOVERNANCE CADENCE MODEL

Status: ACTIVE  
Authority: Phase 63

## 1. Cadence Layers
- Run cadence: every execution produces a fresh governance decision
- Daily cadence: review latest passing evidence directory
- Weekly cadence: compare latest operational posture against prior baseline
- Breach cadence: immediate review when severity >= SEV2_MAJOR

## 2. Review Inputs
- latest measured SLA metrics
- breach classification output
- escalation actions
- runtime state continuity
- prior evidence linkage

## 3. Review Outputs
- operational governance status
- review snapshot
- escalation action record
- gate result

## 4. Decision Rules
- `CADENCE_OPERATIONAL` when severity is SEV0_INFO
- `CADENCE_WARNING` when severity is SEV1_WARNING
- `CADENCE_ESCALATED` when severity is SEV2_MAJOR
- `CADENCE_CRITICAL_REVIEW` when severity is SEV3_CRITICAL

## 5. Source-of-Truth Rule
All governance decisions must reference:
- pushed commit hash
- current evidence directory
- prior linked evidence directory
