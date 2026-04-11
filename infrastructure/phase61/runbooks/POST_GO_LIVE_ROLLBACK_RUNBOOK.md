# Post-Go-Live Rollback Runbook

## Trigger conditions
- hypercare incident state persists
- rollback readiness required
- production instability confirmed

## Rollback posture
- preserve operational evidence
- mark hypercare state ROLLBACK_TRIGGERED when executed
- use phase59/phase60 rollback discipline as source
