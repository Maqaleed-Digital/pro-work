# WORKCAPTAIN — BACKEND SERVICE CONTRACT

Version: 1.0  
Status: ACTIVE

## 1. Required Services

### api-service
Purpose:
- public API-facing backend behind `api.workcaptain.ai`

Minimum contract:
- process starts successfully in Cloud Run
- exposes `/health`
- exposes `/ready`
- returns non-placeholder application identity in health payload or equivalent response behavior

### trust-processor
Purpose:
- backend processor for trust-domain operations

Minimum contract:
- process starts successfully
- exposes `/health`
- has explicit service identity distinct from api-service

### agent-orchestrator
Purpose:
- backend orchestrator for agent-domain operations

Minimum contract:
- process starts successfully
- exposes `/health`
- has explicit service identity distinct from the other services

### background-worker
Purpose:
- backend worker runtime for asynchronous or internal jobs

Minimum contract:
- process starts successfully
- exposes `/health` or equivalent runtime health response suitable for verification
- has explicit service identity distinct from the other services

## 2. Forbidden Implementation Shortcut

Forbidden:
- one placeholder server copied conceptually across all services and relabeled without actual service separation
- one Dockerfile and one codebase reused unchanged purely to satisfy image count
- using frontend apps as backend substitutes

## 3. Allowed Initial Simplicity

Allowed:
- minimal service logic
- minimal endpoint surface
- slim internal implementations
- phase-appropriate scaffolding

The minimum bar is truthful distinct service existence and buildability.
