# WORKCAPTAIN — DELIVERY RELIABILITY CONTROLS POLICY

Status: ACTIVE  
Authority: Phase 69

## 1. Principle
All delivery reliability and retry governance decisions must derive from fresh measured evidence, linked continuity, and prior channel audit records.

## 2. Reliability States
- `RELIABILITY_OPERATIONAL`
- `RELIABILITY_WARNING`
- `RELIABILITY_ESCALATED`
- `RELIABILITY_BLOCKED`

## 3. Retry Governance Contract
This phase produces governed retry and assurance artifacts for:
- Slack
- email
- webhook

Every retry decision must produce:
- retry audit record
- retry eligibility decision
- assurance contribution
- timestamp
- source-of-truth commit reference
- evidence directory reference

## 4. Retry Rules
- a channel is retry-eligible only if the prior dispatch audit exists and indicates a non-success result
- a successful prior dispatch must produce a retry decision of `NOT_REQUIRED`
- a missing prior audit must produce a blocked retry decision
- retry governance success is evidence-based, not assumed

## 5. Non-Negotiables
- no silent retry eligibility
- no retry decision without audit linkage
- no inferred assurance result
- no promotion of retry artifacts to source of truth
