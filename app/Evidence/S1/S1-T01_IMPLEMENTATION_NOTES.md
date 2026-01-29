# S1-T01 — Workspace CRUD API (Service Layer)

## Scope delivered
- Workspace create/read/list/update/archive implemented as pure service functions
- Owner isolation enforced on read/list/update/archive
- Audit events emitted for create/update/archive
- EN + AR supported via name_en + name_ar fields (Tier-1 only)

## Endpoints
No HTTP endpoints created yet. This sprint implements domain/service primitives first to avoid premature framework commitment.
HTTP API wiring will be done once the server framework is selected.

## Audit events
- workspace.created
- workspace.updated
- workspace.archived

## Notes
- Archive is soft-delete via archivedAt timestamp
- No employment/timecard constructs introduced (aligned with Gold BRD binding rules)
