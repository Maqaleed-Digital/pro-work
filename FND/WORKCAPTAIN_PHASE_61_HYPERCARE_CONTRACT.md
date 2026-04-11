# WORKCAPTAIN / PROWORK — PHASE 61 HYPERCARE CONTRACT

## Required hypercare variables
- WC_HYPERCARE_OWNER
- WC_HYPERCARE_WINDOW_DAYS
- WC_HYPERCARE_INCIDENT_CHANNEL
- WC_HYPERCARE_STATUS_PAGE_URL
- WC_HYPERCARE_ROLLBACK_OWNER

## Hypercare states
- NOT_STARTED
- ACTIVE_HYPERCARE
- STABILIZED
- INCIDENT_ACTIVE
- ROLLBACK_TRIGGERED

## Fail-closed rules
- hypercare activation requires LIVE_VERIFIED production state
- blank values are invalid
- hypercare cannot become STABILIZED without persisted stableAt timestamp
- rollback readiness must not be inferred from UI state

## Runtime derivation rule
Mounted runtime must derive hypercare state from persisted operational state only.
