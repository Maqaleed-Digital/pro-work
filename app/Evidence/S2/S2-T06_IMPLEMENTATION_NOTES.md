# S2-T06 — Workspace → Pods Relation Endpoint

## Scope delivered
Endpoint:
- GET `/api/workspaces/:id/pods`
  - Optional query: `includeArchivedPods=true`

## Enforcement
- Owner isolation via service layer
- Archived workspace protection remains enforced
- requestId propagation still applies

## Notes
In-memory persistence means workspace/pod ids are only valid within the same server session.
