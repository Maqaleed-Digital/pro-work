# WORKCAPTAIN / PROWORK — PHASE 59 EVIDENCE CONTRACT

## Required evidence
- PRECHECK.txt
- CONFIG_VALIDATION.txt
- DEPLOYMENT_STATUS_BEFORE.txt
- CONFIG_CHECK_RESPONSE.txt
- DEPLOYMENT_SUMMARY_RESPONSE.txt
- PRODUCTION_STATUS_RESPONSE.txt
- DEPLOYMENT_MANIFEST_COPY.yaml
- CLOUD_RUN_SERVICE_ENV.txt
- RUNBOOK_CHECK.txt
- SUMMARY.md

## Determinism
- overwrite-safe writes only (tmp → mv)
- one canonical execution block only
- evidence path: evidence/phase59_<timestamp>/

## Stop condition
Phase 59 completes only when:
- config validation passes
- mounted runtime serves production status routes
- deployment script and runbooks exist
- evidence proves production is configured but not falsely marked live
