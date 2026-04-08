# WORKCAPTAIN — RUNTIME VERIFICATION MATRIX

Version: 1.0  
Status: ACTIVE

## 1. Services

### api-service
- verify deploy command success
- verify latest ready revision exists
- verify service URL returns healthy response where applicable
- verify public route `https://api.workcaptain.ai/health` succeeds

### trust-processor
- verify deploy command success
- verify latest ready revision exists
- verify service describe output captured

### agent-orchestrator
- verify deploy command success
- verify latest ready revision exists
- verify service describe output captured

### background-worker
- verify deploy command success
- verify latest ready revision exists
- verify service describe output captured

## 2. Evidence Minimum

Evidence pack must include:
- pre-cutover service describe outputs
- pre-cutover revision snapshots
- pre-cutover image snapshots
- deploy logs for all four services
- post-cutover service describe outputs
- post-cutover revision snapshots
- public API health check
- manifest
- rollback commands

## 3. Carry-Forward Validation

Application-layer route boundary note must be reassessed after real runtime cutover, especially for `/admin`.
