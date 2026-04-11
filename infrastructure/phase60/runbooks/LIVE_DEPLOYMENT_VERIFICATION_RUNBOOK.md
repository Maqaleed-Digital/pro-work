# Live Deployment Verification Runbook

## Preconditions
- production deployment completed
- WC_PROD_BASE_URL reachable
- valid production API key available
- active runtime mounted with production routes

## Steps
1. validate required live variables
2. verify /health
3. verify /api/production/status
4. verify /api/external/secure-health with x-api-key
5. persist LIVE_VERIFIED only after all checks pass
6. capture evidence

## Failure posture
- stop on first failed check
- set deploymentStatus to DEPLOYMENT_FAILED
- do not issue go-live certification
