# WORKCAPTAIN — PRE-PHASE-6 ACCEPTANCE AND EVIDENCE

Version: 1.0  
Status: ACTIVE

## 1. Acceptance Criteria

The phase passes only if all are true:

- `services/api-service/Dockerfile` exists
- `services/trust-processor/Dockerfile` exists
- `services/agent-orchestrator/Dockerfile` exists
- `services/background-worker/Dockerfile` exists
- each service directory contains source files
- repository discovery no longer returns placeholder-only backend state

## 2. Required Evidence

Evidence pack must include:
- tree snapshot for `services/`
- Dockerfile listing
- service source file listing
- build command inventory for all four services
- manifest with timestamp and source-of-truth commit
- blocked or pass result from backend implementation gate script

## 3. Failure Condition

If any required service directory or Dockerfile is missing, this phase is not complete.
