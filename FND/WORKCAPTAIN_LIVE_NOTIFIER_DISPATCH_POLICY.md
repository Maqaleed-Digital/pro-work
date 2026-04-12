# WORKCAPTAIN — LIVE NOTIFIER DISPATCH POLICY

Status: ACTIVE  
Authority: Phase 67

## 1. Principle
All dispatch governance must derive from fresh measured evidence and linked continuity.

## 2. Dispatch States
- `DISPATCH_OPERATIONAL`
- `DISPATCH_WARNING`
- `DISPATCH_ESCALATED`
- `DISPATCH_BLOCKED`

## 3. Channel Contract
This phase produces governed delivery artifacts only:
- Slack delivery payload
- email delivery payload
- webhook delivery payload
- channel readiness assessment

This phase does not send outbound notifications.

## 4. Channel Readiness Rules
Readiness is based on configuration presence only:
- Slack webhook target configured
- email recipient target configured
- webhook endpoint configured

No external dispatch test is performed in this phase.

## 5. Non-Negotiables
- no silent dispatch activation
- no unsourced delivery payloads
- no file content duplication
- no external dispatch execution in this phase
