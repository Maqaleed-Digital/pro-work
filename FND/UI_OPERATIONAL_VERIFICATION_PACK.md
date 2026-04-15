# UI OPERATIONAL VERIFICATION PACK

## OBJECTIVE
Provide a single governed verification pack for the runtime-converged ProWork UI.

## TARGET
- Frontend Root: prowork_runtime/web
- Runtime Target: governed frontend selection applied explicitly
- Source UI bundle: ui_wave1
- Public Runtime Prefix: /prowork-wave1

## WHAT THIS PACK VERIFIES
1. Frontend target exists and is explicit
2. Required runtime assets exist in live public runtime
3. Required production route files exist
4. Production wrappers point to the correct Wave 1 assets
5. Public HTML surfaces contain required feature markers
6. Core navigation links are present across the surfaced routes
7. Next.js build succeeds
8. Next.js start succeeds
9. Basic concurrent route handling succeeds against live runtime

## RESULTS
- Routes verified: 5 (all PASS, all iframeOk)
- Static pages verified: 5 (all PASS, 0 marker misses, 0 nav misses)
- Assets verified: 7 (all PASS)
- Concurrency: 96 requests, 0 failures, avg 65ms, max 120ms
- Overall: PASS

## OUTPUTS
- evidence/ui_operational_verification_20260415T080710Z/runtime_target_map.txt
- evidence/ui_operational_verification_20260415T080710Z/verification_report.json
- evidence/ui_operational_verification_20260415T080710Z/verification_report.md
- evidence/ui_operational_verification_20260415T080710Z/EXECUTION_STATUS.txt

## GOVERNANCE
- fail-closed validation
- explicit frontend target only
- overwrite-safe file creation
- single source-of-truth commit only
