# Production Rollback Runbook

## Trigger conditions
- failed health verification
- failed production status verification
- incorrect runtime configuration
- incorrect image promotion

## Rollback posture
- use previous known-good Cloud Run revision
- re-run health verification
- capture rollback evidence
