# WORKCAPTAIN / PROWORK — PHASE 59 PRODUCTION ENVIRONMENT CONTRACT

## Required environment variables
- WC_PROD_GCP_PROJECT_ID
- WC_PROD_GCP_REGION
- WC_PROD_SERVICE_NAME
- WC_PROD_IMAGE_URI
- WC_PROD_BASE_URL
- WC_PROD_ENVIRONMENT
- WC_PROD_API_KEY_SEED_VERSION

## Optional environment variables
- WC_PROD_MIN_INSTANCES
- WC_PROD_MAX_INSTANCES
- WC_PROD_CPU
- WC_PROD_MEMORY
- WC_PROD_TIMEOUT_SECONDS
- WC_PROD_CONCURRENCY
- WC_PROD_ALLOW_UNAUTHENTICATED

## Fail-closed rules
- blank values are invalid
- environment defaults must not silently promote to production values
- deployment scripts must stop on first missing required variable
- deployment evidence must include resolved non-secret production configuration

## Runtime production status rule
Production status may be:
- NOT_DEPLOYED
- DEPLOYMENT_CONFIGURED
- DEPLOYED_PENDING_VERIFICATION
- LIVE_VERIFIED
- DEPLOYMENT_FAILED

The mounted runtime must derive this from persisted deployment state only.
