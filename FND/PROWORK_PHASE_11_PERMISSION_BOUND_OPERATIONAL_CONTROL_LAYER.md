# PROWORK — PHASE 11
## Permission-Bound Operational Control Layer

Version: 1.0
Status: IMPLEMENTED
Source of Truth Base: f5d90693
Project Identity: ProWork = WorkCaptain

---

## Objective

Extend the live RBAC-enforced runtime from route-level role authorization into explicit permission-bound operational control.

Phase 10 established:
- authenticated identity via Bearer token
- role-aware protected routes
- superadmin / ops / auditor enforcement
- fail-closed RBAC in `admin_permissions.js`

Phase 11 adds:
- explicit operational permission catalog (`ops:*` namespace)
- semantic class mapping (system.read → ops:system:read, etc.)
- `checkPerm()` returning structured decision records
- `requireAdminPerm()` emitting structured permission decision logs via Logger
- permission-bound `/api/ops/*` operational control routes
- deterministic deny-by-default for sensitive mutations
- unit tests covering all allow/deny paths
- evidence runner at `scripts/prowork_phase11_permission_bound_operational_control.sh`

---

## Implementation Files

| File | Change | Purpose |
|------|--------|---------|
| `app/lib/admin_permissions.js` | Extended | Phase 11 permission catalog, SEMANTIC_MAP, checkPerm() |
| `app/server.js` | Extended | Logger import, requireAdminPerm logs, /api/ops/* routes |
| `tests/production/phase11_permission_control.test.js` | New | 33 allow/deny unit tests |
| `scripts/prowork_phase11_permission_bound_operational_control.sh` | New | Evidence runner |
| `FND/PROWORK_PHASE_11_PERMISSION_BOUND_OPERATIONAL_CONTROL_LAYER.md` | New | This doc |
| `FND/PROWORK_PERMISSION_MATRIX.md` | New | Role-to-permission matrix |
| `FND/PROWORK_OPERATIONAL_CONTROL_EVIDENCE_CONTRACT.md` | New | Evidence contract |

---

## Permission Architecture

### Fail-Closed Rules
- missing permission mapping → deny
- unknown permission string → deny (not in PERMS catalog)
- missing resolved permission set → deny
- guard error → deny
- auth failure → 401
- insufficient role or permission → 403

### Route Protection
- `/api/health` — public (no auth)
- `/api/admin/*` — authenticated + role-level RBAC (Phase 10, preserved)
- `/api/ops/*` — authenticated + explicit permission check (Phase 11)

### New Operational Routes

| Method | Route | Permission | Allowed Roles |
|--------|-------|-----------|---------------|
| GET | `/api/ops/status` | `ops:status:read` | superadmin, ops |
| POST | `/api/ops/execute` | `ops:execute` | superadmin, ops |
| POST | `/api/ops/retry` | `ops:retry` | superadmin, ops |
| POST | `/api/ops/override` | `ops:override` | superadmin only |

---

## Non-Negotiable Constraints (All Met)
- Real repo runtime modified — no parallel sample code
- Phase 10 RBAC preserved — all existing tests continue to pass
- Structured permission decisions logged via Logger.info("permission.decision", {...})
- superadmin sovereign (all permissions)
- ops: execute + retry; override denied
- auditor: read-only; no operational control
