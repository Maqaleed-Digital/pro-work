# WORKCAPTAIN / PROWORK — PHASE 60 EVIDENCE CONTRACT

## Required evidence
- PRECHECK.txt
- LIVE_VAR_VALIDATION.txt
- LOCAL_PRODUCTION_STATUS_BEFORE.txt
- LIVE_HEALTH_RESPONSE.txt
- LIVE_PRODUCTION_STATUS_RESPONSE.txt
- LIVE_SECURE_HEALTH_RESPONSE.txt
- LOCAL_LIVE_VERIFICATION_RESPONSE.txt
- LOCAL_GO_LIVE_CERTIFICATION_RESPONSE.txt
- RUNBOOK_CHECK.txt
- SUMMARY.md

## Determinism
- overwrite-safe writes only (tmp → mv)
- one canonical execution block only
- evidence path: evidence/phase60_<timestamp>/

## Stop condition
Phase 60 completes only when:
- live variable validation passes
- live external checks pass
- persisted production state updates to LIVE_VERIFIED
- mounted runtime serves live verification and go-live certification routes
