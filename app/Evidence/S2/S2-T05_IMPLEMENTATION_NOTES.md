# S2-T05 — Pod Role Assignment HTTP Endpoints

## Scope delivered
Mounted router: `/api/pod-role-assignments`

Endpoints:
- POST `/api/pod-role-assignments` (assign)
- GET `/api/pod-role-assignments?podId=...` (list; includeUnassigned=true supported)
- POST `/api/pod-role-assignments/:assignmentId/unassign` (unassign)

## Identity handling (temporary for S2)
Headers:
- x-owner-id
- x-actor-id
- x-request-id

## Governance
- Owner isolation enforced via service layer
- requestId propagated into audit events automatically
