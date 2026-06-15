# WORKCAPTAIN — PHASE 6 ROLLBACK AND FAILURE CONTRACT

Version: 1.0  
Status: ACTIVE

## 1. Rollback Triggers

Rollback is required if:
- public health endpoint fails after cutover
- any critical service fails to produce a ready revision
- image deployment targets are incorrect
- runtime startup failures appear in post-cutover checks
- edge remains up but backend real runtime is unhealthy

## 2. Rollback Strategy

Preferred rollback:
- redeploy previous known-good image reference to affected service
- if previous image reference is unavailable, redeploy previous ready revision image captured in evidence

## 3. Required Rollback Scope

Rollback commands must be recorded for:
- `api-service`
- `trust-processor`
- `agent-orchestrator`
- `background-worker`

## 4. Completion Rule

No completion status is allowed if rollback data is missing.
