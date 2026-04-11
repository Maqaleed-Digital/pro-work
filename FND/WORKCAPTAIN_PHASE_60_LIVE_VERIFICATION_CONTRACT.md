# WORKCAPTAIN / PROWORK — PHASE 60 LIVE VERIFICATION CONTRACT

## Required live variables
- WC_PROD_BASE_URL
- WC_PROD_API_KEY
- WC_PROD_EXPECTED_SERVICE_NAME
- WC_PROD_EXPECTED_ENVIRONMENT

## Objective verification checks
1. GET {WC_PROD_BASE_URL}/health returns 200
2. GET {WC_PROD_BASE_URL}/api/production/status returns 200
3. GET {WC_PROD_BASE_URL}/api/external/secure-health with x-api-key returns 200
4. Returned environment matches WC_PROD_EXPECTED_ENVIRONMENT when available
5. Returned service or status context is consistent with production deployment state

## Fail-closed rules
- any failed check fails verification
- partial success is not sufficient for LIVE_VERIFIED
- missing variables invalidate verification
- no manual override in this phase
