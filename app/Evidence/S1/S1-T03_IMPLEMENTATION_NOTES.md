# S1-T03 — Pod Role Assignment (Service Layer)

## Scope delivered
- PodRole taxonomy:
  - pod_lead
  - specialist
  - qa
  - reviewer
- PodRoleAssignment records with assign/unassign support
- Owner isolation enforced
- Audit events emitted:
  - pod.role_assigned
  - pod.role_unassigned

## Notes
- Service-first implementation; HTTP API wiring deferred until framework selection
- No employment/time constructs introduced
