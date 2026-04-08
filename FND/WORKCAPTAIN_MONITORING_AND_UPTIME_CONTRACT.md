# WORKCAPTAIN — MONITORING AND UPTIME CONTRACT

Version: 1.0  
Status: ACTIVE

## 1. Public Monitoring Target

Primary monitored endpoint:

- `https://api.workcaptain.ai/health`

## 2. Required Monitoring Artifacts

This phase must create and record:

- uptime check configuration
- alert policy linked to uptime failure
- at least one backend-oriented alert baseline
- evidence snapshots of created resources

## 3. Service Inventory Scope

Evidence should record current state for:

- `api-service`
- `trust-processor`
- `agent-orchestrator`
- `background-worker`

## 4. Operational Rule

Monitoring must be additive and non-destructive.  
No change in this phase may weaken currently working runtime or route controls.
