# Production Deployment Runbook

## Preconditions
- authenticated gcloud session
- correct project selected
- required environment variables loaded
- image already exists in Artifact Registry

## Steps
1. validate production environment variables
2. render Cloud Run manifest
3. deploy service with gcloud run services replace
4. verify /health
5. verify /api/production/status
6. capture evidence

## Failure posture
- stop on first failed validation
- do not claim live status without verification
