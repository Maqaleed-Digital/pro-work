# WORKCAPTAIN — EXECUTIVE ACTION CHANNEL MODEL

Status: ACTIVE  
Authority: Phase 66

## 1. Channel Types
- `EXECUTIVE_SUMMARY`
- `EXECUTIVE_ALERT`
- `EXECUTIVE_ESCALATION`
- `EXECUTIVE_REVIEW_REQUIRED`

## 2. Channel Decision Rules
- EXECUTIVE_SUMMARY when alert state is operational
- EXECUTIVE_ALERT when alert state is warning
- EXECUTIVE_ESCALATION when alert state is escalated
- EXECUTIVE_REVIEW_REQUIRED when alert state is blocked

## 3. Required Channel Fields
- source-of-truth commit
- current evidence directory
- linked evidence continuity
- runtime state
- governance posture
- action recommendations
- timestamp

## 4. Source-of-Truth Rule
All channel outputs must reference:
- pushed commit hash
- current evidence directory
- linked Phase 62 evidence directory
- linked Phase 63 evidence directory
- linked Phase 64 evidence directory
- linked Phase 65 evidence directory
