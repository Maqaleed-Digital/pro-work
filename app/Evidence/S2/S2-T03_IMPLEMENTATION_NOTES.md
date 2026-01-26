# S2-T03 — Workspace HTTP Endpoints

## Scope delivered
Mounted router: `/api/workspaces`

Endpoints:
- POST `/api/workspaces` (create)
- GET `/api/workspaces` (list; `includeArchived=true` supported)
- GET `/api/workspaces/:id` (get by id)
- PATCH `/api/workspaces/:id` (update)
- POST `/api/workspaces/:id/archive` (archive)

## Identity handling (temporary for S2)
Headers:
- x-owner-id (defaults to owner_demo)
- x-actor-id (defaults to actor_demo)
- x-request-id (optional; generated if missing; echoed back)

## Governance
- Owner isolation enforced via service layer
- requestId propagated into audit events automatically (S2-T02)
