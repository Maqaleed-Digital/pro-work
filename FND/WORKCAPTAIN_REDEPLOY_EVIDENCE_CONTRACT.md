# WORKCAPTAIN — REDEPLOY EVIDENCE CONTRACT
#
# Status: ACTIVE

## 1. Required Evidence Files

- WEB_BUILD_RESULT.txt
- API_BUILD_RESULT.txt
- FRONTEND_TRIGGER_RESULT.txt
- FRONTEND_TRIGGER_RESULT.err
- BACKEND_TRIGGER_RESULT.txt
- BACKEND_TRIGGER_RESULT.err
- PHASE97_RERUN_RESULT.txt
- LIVE_REDEPLOY_STATUS.txt

## 2. Reporting Rule

Evidence must show:
- web-service source build + deploy result (exit code)
- api-service source build + deploy result (exit code)
- frontend trigger HTTP response
- backend trigger HTTP response
- Phase 97 rerun STATUS_CODE (PASS or BLOCKED_*)
- final LIVE_REDEPLOY_STATUS (PASS or BLOCKED_*)

## 3. Status Codes

- BLOCKED_WEB_BUILD_FAILURE
- BLOCKED_API_BUILD_FAILURE
- BLOCKED_TRIGGER_FAILURE
- BLOCKED_PHASE97_FAILURE
- PASS
