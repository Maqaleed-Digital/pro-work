# Sprint A — WOS Core: Governance Update

**Date:** 2026-03-06
**Phase baseline:** Phase 1 commit `5ff7de2`
**Status:** Delivered

---

## Scope

Sprint A delivers the WOS (Workforce Orchestration System) Core domain layer on top of the Phase 1 Trust Event Foundation. Every business state transition in WOS Core is now backed by a canonical domain event.

---

## Delivered Modules

| File | Role |
|------|------|
| `app/modules/execution_engine/event_hooks.js` | +2 emitters: `emitExecutionJobCreated`, `emitDeliverableSubmitted` |
| `app/modules/wos/worker_service.js` | Worker lifecycle (create, status transitions, pod assignment) |
| `app/modules/wos/pod_service.js` | Pod management (create, state) |
| `app/modules/wos/assignment_service.js` | Worker → Pod assignments with capacity enforcement |
| `app/modules/wos/project_service.js` | Project lifecycle → emits `PROJECT_CREATED` |
| `app/modules/wos/workstream_service.js` | Workstream lifecycle → emits `WORKSTREAM_CREATED` |
| `app/modules/wos/milestone_service.js` | Milestone lifecycle → emits `MILESTONE_CREATED`, `MILESTONE_COMPLETED` (trust-sensitive) |
| `app/modules/wos/execution_job_service.js` | Execution job lifecycle → emits `EXECUTION_JOB_CREATED`, `EXECUTION_JOB_COMPLETED` |
| `app/modules/wos/index.js` | WOS Core factory (`createWosCore`) + barrel |
| `app/modules/wos/projections/dashboard.js` | Dashboard read model (event-sourced projection) |
| `app/api/wos_router.js` | HTTP dispatch layer (18 routes, no framework) |
| `app/storage/migrations/20260306_sprint_a_wos_core.sql` | 7 Postgres tables + indexes |

---

## Domain Model

### Aggregate: PROJECT
- Statuses: `DISCUSSION → ACTIVE → COMPLETED → ARCHIVED`
- Created via: `POST /api/wos/projects`
- Emits: `PROJECT_CREATED` (STANDARD trust)

### Aggregate: WORKSTREAM
- Statuses: `ACTIVE | PAUSED | COMPLETED`
- Requires an open project (`DISCUSSION` or `ACTIVE`)
- Created via: `POST /api/wos/workstreams`
- Emits: `WORKSTREAM_CREATED` (STANDARD trust)

### Aggregate: MILESTONE
- Statuses: `OPEN → IN_PROGRESS → COMPLETED` (linear)
- Completion emits `MILESTONE_COMPLETED` (HIGH trust → trust ledger)
- Requires: `approval_record_id`, `evidence_pack_id` in completion payload
- Created via: `POST /api/wos/milestones`
- Completed via: `POST /api/wos/milestones/:id/complete`

### Aggregate: EXECUTION_JOB
- Statuses: `PENDING → RUNNING → COMPLETED | FAILED`
- Emits: `EXECUTION_JOB_CREATED` (STANDARD), `EXECUTION_JOB_COMPLETED` (STANDARD)
- `requires_approval` flag surfaces on completion

### Entity: WORKER
- Types: `FTE | FREELANCER`
- Statuses: `ACTIVE ↔ INACTIVE`, `ACTIVE ↔ SUSPENDED`
- No domain event (not in Phase 1 event catalog; will be added in Sprint E Lifecycle)
- Tracked via WOS evidence events in dev app

### Entity: POD
- States: `ACTIVE | INACTIVE`
- Capacity enforced on assignment creation

### Relationship: ASSIGNMENT (Worker → Pod)
- Capacity-checked at creation time
- Deactivation side-effects: clears `worker.assigned_pod`

---

## Trust Integration

| Transition | Event | Trust Level | Ledger |
|-----------|-------|-------------|--------|
| Project created | `PROJECT_CREATED` | STANDARD | No |
| Workstream created | `WORKSTREAM_CREATED` | STANDARD | No |
| Milestone created | `MILESTONE_CREATED` | STANDARD | No |
| **Milestone completed** | **`MILESTONE_COMPLETED`** | **HIGH** | **Yes** |
| Execution job created | `EXECUTION_JOB_CREATED` | STANDARD | No |
| Execution job completed | `EXECUTION_JOB_COMPLETED` | STANDARD | No |

---

## Dashboard Projection

Handles 5 event types (replay-safe, in-memory):
- `PROJECT_CREATED` → `project_count++`
- `WORKSTREAM_CREATED` → `workstream_count++`
- `MILESTONE_CREATED` → `milestone_open_count++`
- `MILESTONE_COMPLETED` → `milestone_open_count--`, `milestone_completed_count++`
- `EXECUTION_JOB_COMPLETED` → `execution_job_completed_count++`

---

## API Surface (18 routes)

```
POST   /api/wos/projects
GET    /api/wos/projects
GET    /api/wos/projects/:id
POST   /api/wos/projects/:id/status

POST   /api/wos/workstreams
GET    /api/wos/workstreams
GET    /api/wos/workstreams/:id

POST   /api/wos/milestones
GET    /api/wos/milestones
GET    /api/wos/milestones/:id
POST   /api/wos/milestones/:id/complete

POST   /api/wos/workers
GET    /api/wos/workers
GET    /api/wos/workers/:id
PATCH  /api/wos/workers/:id
POST   /api/wos/workers/:id/status

POST   /api/wos/pods
GET    /api/wos/pods
GET    /api/wos/pods/:id

POST   /api/wos/assignments
GET    /api/wos/assignments
POST   /api/wos/assignments/:id/deactivate

POST   /api/wos/execution-jobs
GET    /api/wos/execution-jobs
POST   /api/wos/execution-jobs/:id/complete

GET    /api/wos/dashboard
```

---

## Hard Rules (inherited from Phase 1)

1. No important business state transition happens without a domain event.
2. `MILESTONE_COMPLETED` is always hash-chained in the trust ledger.
3. Phase 1 event envelope contract is immutable.
4. All services use zero external dependencies (Node stdlib only).

---

## Next Sprint

**Sprint B — Sovereign Recruiting:**
- Requisition lifecycle (OPEN → SHORTLISTED → FILLED → CLOSED)
- Candidate pipeline events
- Wire to WOS Workstream / Project bootstrap
