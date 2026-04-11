# WORKCAPTAIN / PROWORK — PHASE 61 EVIDENCE CONTRACT

## Required evidence
- PRECHECK.txt
- HYPERCARE_VAR_VALIDATION.txt
- LOCAL_PRODUCTION_STATUS_BEFORE.txt
- HYPERCARE_STATE_SNAPSHOT.json
- LOCAL_HYPERCARE_STATUS_RESPONSE.txt
- LOCAL_HYPERCARE_SUMMARY_RESPONSE.txt
- LOCAL_ROLLBACK_READINESS_RESPONSE.txt
- RUNBOOK_CHECK.txt
- SUMMARY.md

## Determinism
- overwrite-safe writes only (tmp → mv)
- one canonical execution block only
- evidence path: evidence/phase61_<timestamp>/

## Stop condition
Phase 61 completes only when:
- required hypercare variables validate
- persisted hypercare state is created
- mounted runtime serves hypercare routes
- rollback readiness is derived from persisted operational state
