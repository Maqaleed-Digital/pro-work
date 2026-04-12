# WORKCAPTAIN — REAL-TIME ALERTING POLICY

Status: ACTIVE  
Authority: Phase 66

## 1. Principle
All alerting and outbound executive action artifacts must derive from fresh measured evidence and linked evidence continuity.

## 2. Alert States
- `ALERT_STATE_OPERATIONAL`
- `ALERT_STATE_WARNING`
- `ALERT_STATE_ESCALATED`
- `ALERT_STATE_BLOCKED`

## 3. Outbound Contract
This phase produces governed outbound payloads only:
- alert payloads
- webhook-ready integration payload
- executive action channel payloads

This phase does not send notifications and does not invoke external services.

## 4. Executive Channel Rules
Executive action channels may include:
- executive summary metadata
- current posture
- evidence paths
- action recommendations
- timestamps

Executive action channels must never include:
- repository file contents
- inferred values
- code
- partial diffs

## 5. Non-Negotiables
- no silent alert success
- no unsourced outbound payloads
- no promotion of payloads to source of truth
- no real external dispatch in this phase
