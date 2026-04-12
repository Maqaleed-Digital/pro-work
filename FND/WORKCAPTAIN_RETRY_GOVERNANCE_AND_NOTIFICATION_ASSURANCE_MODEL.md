# WORKCAPTAIN — RETRY GOVERNANCE + NOTIFICATION ASSURANCE MODEL

Status: ACTIVE  
Authority: Phase 69

## 1. Channel Types
- `SLACK_CHANNEL`
- `EMAIL_CHANNEL`
- `WEBHOOK_CHANNEL`

## 2. Reliability Decision Rules
- reliability is OPERATIONAL when governance posture is healthy and all channel assurance outcomes are satisfied
- reliability is WARNING when governance posture is healthy but one or more channels require retry or assurance falls below full coverage
- reliability is ESCALATED when governance posture is escalated but assurance chain remains intact
- reliability is BLOCKED when evidence continuity or runtime continuity is invalid

## 3. Required Audit Fields
- source-of-truth commit
- current evidence directory
- linked evidence chain
- runtime posture
- reliability state
- channel type
- prior dispatch result
- retry eligibility
- retry decision timestamp
- assurance status
- result summary

## 4. Source-of-Truth Rule
All reliability and assurance decisions must reference:
- pushed commit hash
- current evidence directory
- linked Phase 62 evidence directory
- linked Phase 63 evidence directory
- linked Phase 64 evidence directory
- linked Phase 65 evidence directory
- linked Phase 66 evidence directory
- linked Phase 67 evidence directory
- linked Phase 68 evidence directory
