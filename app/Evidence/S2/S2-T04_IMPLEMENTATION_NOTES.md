# S2-T04 — Pod HTTP Endpoints + Lifecycle

## Scope delivered
Mounted router: `/api/pods`

Endpoints:
- POST `/api/pods` (create; requires workspaceId)
- GET `/api/pods` (list; supports workspaceId filter and includeArchived=true)
- GET `/api/pods/:id` (get by id)
- PATCH `/api/pods/:id` (update)
- POST `/api/pods/:id/lifecycle` (set lifecycle)
- POST `/api/pods/:id/archive` (archive)

## Identity handling (temporary for S2)
Headers:
- x-owner-id (defaults to owner_demo)
- x-actor-id (defaults to actor_demo)
- x-request-id (optional; generated if missing; echoed back)

## Governance
- Owner isolation enforced via service layer
- requestId propagated into audit events automatically
- Lifecycle transitions validated by service layer
