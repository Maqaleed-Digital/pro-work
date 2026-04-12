# WORKCAPTAIN — GOVERNANCE CADENCE

Status: ACTIVE  
Authority: Phase 62

## Operating Cadence
- Every run: route sampling + SLA metric computation
- Daily: steady-state evidence snapshot
- Weekly: governance review using latest evidence directory
- On breach: immediate operator review

## Daily Review Questions
- Did all critical routes remain within SLA?
- Did any route breach latency or error thresholds?
- Do runtime states still match the validated live posture?
- Is rollback readiness still asserted by runtime evidence?

## Weekly Review Questions
- Is the same route repeatedly near threshold?
- Are breach events clustered by endpoint?
- Is the production posture stable enough to retire hypercare?
- Are thresholds still appropriate for enterprise commitments?

## Decision Standard
All operating decisions must reference the latest successful evidence directory and pushed commit hash.
