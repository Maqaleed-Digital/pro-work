# WORKCAPTAIN — SLA GOVERNANCE POLICY

Status: ACTIVE  
Authority: Phase 62

## 1. Principle
No SLA claim may exist without measured, timestamped, route-level evidence.

## 2. Metrics
The minimum steady-state policy metrics are:

- Availability: `99.90%`
- Maximum average latency: `1000 ms`
- Maximum max latency: `2500 ms`
- Maximum error rate: `0.50%`

## 3. Measurement Scope
Critical route set:
- `/api/production/status`
- `/api/production/go-live-certification`
- `/api/operations/hypercare/status`
- `/api/operations/hypercare/rollback-readiness`

## 4. Measurement Method
- Active HTTP sampling
- Deterministic sample count
- UTC timestamps only
- Route-level aggregation
- Evidence persisted for every run

## 5. SLA States
- `SLA_OPERATIONAL`
- `SLA_DEGRADED`
- `SLA_BREACHED`

## 6. Breach Logic
A route is considered breached if any of the following is true:
- availability below threshold
- average latency above threshold
- max latency above threshold
- error rate above threshold

System posture is:
- `SLA_OPERATIONAL` when all routes pass
- `SLA_DEGRADED` when one or more routes warn but runtime remains reachable
- `SLA_BREACHED` when policy threshold is violated

## 7. Governance Consequences
On breach:
- write `BREACH_LOG.json`
- mark gate failed
- preserve captured response bodies
- require operator review before any success claim

## 8. Non-Negotiables
- No silent success
- No inferred compliance
- No mutation of live state inside the governance script
