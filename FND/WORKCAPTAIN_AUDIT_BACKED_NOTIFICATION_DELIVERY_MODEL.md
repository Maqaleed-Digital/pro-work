# WORKCAPTAIN — AUDIT-BACKED NOTIFICATION DELIVERY MODEL

Status: ACTIVE  
Authority: Phase 68

## 1. Channel Types
- `SLACK_CHANNEL`
- `EMAIL_CHANNEL`
- `WEBHOOK_CHANNEL`

## 2. Delivery Decision Rules
- execution is OPERATIONAL when governance posture is healthy and all channel executions succeed
- execution is WARNING when governance posture is healthy but one or more channel executions fail
- execution is ESCALATED when governance posture is escalated but audit chain remains intact
- execution is BLOCKED when evidence continuity or runtime continuity is invalid

## 3. Required Audit Fields
- source-of-truth commit
- current evidence directory
- linked evidence chain
- runtime posture
- execution state
- channel type
- attempt timestamp
- target configured boolean
- execution result
- response digest or result summary

## 4. Source-of-Truth Rule
All delivery audit decisions must reference:
- pushed commit hash
- current evidence directory
- linked Phase 62 evidence directory
- linked Phase 63 evidence directory
- linked Phase 64 evidence directory
- linked Phase 65 evidence directory
- linked Phase 66 evidence directory
- linked Phase 67 evidence directory
