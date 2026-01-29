# S1-T04 — Workspace ↔ Pod Relations (Service Layer)

## Scope delivered
- First-class relation query:
  - listWorkspacePods(ownerId, workspaceId)
  - getWorkspaceWithPods(ownerId, workspaceId)
- Enforcement:
  - Owner isolation (cross-owner access blocked)
  - Archived workspace protection (workspace archived => relation queries blocked)
  - Optional includeArchivedPods behavior

## Notes
- Structural relation already exists via PodRecord.workspaceId.
- This task makes the relation explicit, enforceable, and testable without committing to an HTTP framework yet.
