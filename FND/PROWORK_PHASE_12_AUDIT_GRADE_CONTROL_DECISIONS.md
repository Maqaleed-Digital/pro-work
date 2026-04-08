# PROWORK — PHASE 12
## Audit-Grade Control Decisions + Immutable Authorization Evidence

Version: 1.0
Status: IMPLEMENTED
Source of Truth Base: da2ca563bb5daaff81d2e4ea6284fa0e185053f5
Project Identity: ProWork = WorkCaptain

---

## Objective

Extend the live permission-bound runtime from enforcement-only control into audit-grade, reviewable, tamper-evident authorization evidence.

Phase 10 established route-level RBAC.
Phase 11 established permission-bound operational control.
Phase 12 adds immutable append-only audit evidence for privileged decisions.

---

## Implementation Files

| File | Change | Purpose |
|------|--------|---------|
| `app/lib/authz_audit.js` | New | Append-only JSONL audit writer, schema factory, ID generators, export |
| `app/server.js` | Extended | AuthzAudit import, correlation/request IDs at request boundary, audit-aware requireAdminPerm, authenticateAndAudit helper, audited ops/admin handlers |
| `tests/production/phase12_authz_audit.test.js` | New | 38 unit tests for audit behavior |
| `scripts/prowork_phase12_audit_grade_control_decisions.sh` | New | Evidence runner |
| `FND/PROWORK_PHASE_12_AUDIT_GRADE_CONTROL_DECISIONS.md` | New | This doc |
| `FND/PROWORK_AUTHORIZATION_AUDIT_SCHEMA.md` | New | Audit record schema |
| `FND/PROWORK_AUTHORIZATION_AUDIT_EVIDENCE_CONTRACT.md` | New | Evidence contract |

---

## Architecture

### Append-Only Audit Storage
- File: `app/data/authz_audit.jsonl`
- Each line is a single JSON audit record (JSONL format)
- Written with `fs.appendFileSync` — no in-place mutation possible
- `exportRecords()` writes a JSON array snapshot without altering the JSONL

### Correlation / Trace IDs
- Generated at request entry in `http.createServer` handler
- Propagated via `X-Correlation-Id` and `X-Request-Id` response headers
- Incoming `x-correlation-id` / `x-request-id` request headers are honored (passthrough)
- ID formats: `cid_<uuid>` for correlation, `rid_<uuid>` for request, `aud_<uuid>` for audit records

### Audited Routes (Phase 12)
| Route | Decision Type | Audited Events |
|-------|--------------|----------------|
| `GET /api/admin/stats` | `admin.read` | allow + deny |
| `GET /api/admin/governance` | `admin.read` | allow + deny |
| `GET /api/ops/status` | `ops.read` | allow + deny |
| `POST /api/ops/execute` | `ops.execute` | allow + deny + auth failure |
| `POST /api/ops/retry` | `ops.retry` | allow + deny + auth failure |
| `POST /api/ops/override` | `ops.override` | allow + deny + auth failure |

### requireAdminPerm + authenticateAndAudit
- `requireAdminPerm(res, principal, perm, auditCtx?)` — when `auditCtx` is passed, appends an audit record after every decision (allow or deny)
- `authenticateAndAudit(req, auditCtx)` — calls `Admin.authenticate(req)` and appends a deny record (status 401) on auth failure for audited routes
- All other (non-audited) routes are unaffected — no audit overhead

---

## Non-Negotiable Constraints (All Met)
- Append-only: `fs.appendFileSync` is the only write path
- Deny records are first-class evidence, not optional logs
- Phases 10 and 11 enforcement preserved and tested
- correlation_id and request_id present on all captured privileged records
- Export artifact does not alter source JSONL
- 38 unit tests, 11 HTTP evidence cases
