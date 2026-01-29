# Sprint S2 — Changelog

## Added
- Express runtime HTTP server (`src/server.ts`)
- Request context with AsyncLocalStorage:
  - requestId (header echo + generation)
  - actorId/ownerId (temporary header-based identity for S2)
- Workspace HTTP API:
  - create, list, get, update, archive
- Pod HTTP API:
  - create, list, get, update, lifecycle transition, archive
- Pod role assignment HTTP API:
  - assign, list, unassign
- Workspace → Pods relation endpoint:
  - list pods for a workspace
- Evidence artifacts captured for each S2 task under `app/Evidence/S2/`

## Updated
- Audit emission now auto-attaches requestId from request context when not explicitly provided

## Notes / Known limitations (intentional)
- In-memory storage resets on server restart (persistence deferred)
- Header-based identity is temporary scaffolding for S2
