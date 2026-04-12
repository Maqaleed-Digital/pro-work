# WORKCAPTAIN — STEADY-STATE EVIDENCE CONTRACT

Status: ACTIVE  
Authority: Phase 62

## Required Evidence Directory
`evidence/phase62_<UTC timestamp>`

## Required Files
- `PACK_SUMMARY.md`
- `SLA_BASELINE.json`
- `SLA_METRICS.json`
- `STEADY_STATE_STATUS.json`
- `BREACH_LOG.json`
- `GOVERNANCE_CADENCE_SNAPSHOT.md`
- `GATE_RESULT.md`

## Required Captures
Under `responses/`:
- `production_status.json`
- `go_live_certification.json`
- `hypercare_status.json`
- `rollback_readiness.json`
- `config_check.json`
- `deployment_summary.json`
- `live_verification.json`
- `hypercare_summary.json`

Under `samples/`:
- one sample log per critical route

## Evidence Validity Rules
- UTC timestamps only
- Every JSON artifact must be machine-readable
- Every sampled route must record status code and latency
- Gate result must reflect measured outcomes only

## Failure Contract
If any required file is missing, the evidence pack is invalid.
