# Go-Live Rollback Runbook

## Trigger conditions
- /health fails
- secure external route fails
- production status inconsistent
- live verification fails after deploy

## Rollback posture
- mark deployment status DEPLOYMENT_FAILED
- preserve verification evidence
- execute prior rollback runbook from phase59 if needed
