# WORKCAPTAIN — CONTROLLED DISPATCH EXECUTION POLICY

Status: ACTIVE  
Authority: Phase 68

## 1. Principle
All external dispatch execution must derive from fresh measured evidence, linked continuity, and explicit channel configuration.

## 2. Dispatch Execution States
- `EXECUTION_OPERATIONAL`
- `EXECUTION_WARNING`
- `EXECUTION_ESCALATED`
- `EXECUTION_BLOCKED`

## 3. Execution Contract
This phase performs controlled delivery attempts for:
- Slack
- email
- webhook

Every attempt must produce:
- dispatch audit record
- execution outcome
- timestamp
- source-of-truth commit reference
- evidence directory reference

## 4. Execution Rules
- a channel may only execute if its target is configured
- missing channel configuration must produce a failed audit record
- execution success is evidence-based, not assumed
- one channel failing does not erase the audit record for other channels

## 5. Non-Negotiables
- no silent delivery success
- no delivery attempt without audit
- no inferred outcome
- no promotion of outbound delivery to source of truth
