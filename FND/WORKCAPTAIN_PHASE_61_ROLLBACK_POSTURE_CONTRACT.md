# WORKCAPTAIN / PROWORK — PHASE 61 ROLLBACK POSTURE CONTRACT

## Rollback readiness prerequisites
Rollback readiness is allowed only when:
- production state exists
- hypercare state exists
- rollback owner exists
- rollback runbook exists
- deployment status = LIVE_VERIFIED or ACTIVE_HYPERCARE context exists

## Rollback readiness outputs
- rollbackReady = true|false
- rollbackOwner
- rollbackRunbookPresent
- lastEvaluatedAt
- currentHypercareState

## Governance rule
Rollback readiness must be objective, persisted, and visible in runtime without manual interpretation.
