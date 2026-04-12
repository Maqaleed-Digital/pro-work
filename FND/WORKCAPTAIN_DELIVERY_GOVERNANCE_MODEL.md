# WORKCAPTAIN — DELIVERY GOVERNANCE MODEL

Status: ACTIVE  
Authority: Phase 67

## 1. Channel Types
- `SLACK_CHANNEL`
- `EMAIL_CHANNEL`
- `WEBHOOK_CHANNEL`

## 2. Dispatch Decision Rules
- dispatch is OPERATIONAL when governance posture is healthy and all required channel targets are configured
- dispatch is WARNING when governance posture is healthy but one or more channel targets are absent
- dispatch is ESCALATED when governance posture is escalated but evidence continuity remains intact
- dispatch is BLOCKED when evidence continuity or runtime continuity is invalid

## 3. Required Fields
- source-of-truth commit
- current evidence directory
- linked evidence chain
- runtime posture
- dispatch state
- channel readiness
- action recommendations
- timestamp

## 4. Source-of-Truth Rule
All delivery decisions must reference:
- pushed commit hash
- current evidence directory
- linked Phase 62 evidence directory
- linked Phase 63 evidence directory
- linked Phase 64 evidence directory
- linked Phase 65 evidence directory
- linked Phase 66 evidence directory
