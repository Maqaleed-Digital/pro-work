# PROWORK — AUTHORIZATION AUDIT SCHEMA

Version: 1.0
Status: ACTIVE
Phase: 12

---

## Canonical Audit Record Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `audit_record_id` | string | yes | Unique record ID (`aud_<uuid>`) |
| `timestamp` | ISO 8601 | yes | Decision timestamp (UTC) |
| `correlation_id` | string | yes | Request correlation ID (`cid_<uuid>`) |
| `request_id` | string | yes | Request trace ID (`rid_<uuid>`) |
| `route` | string | yes | Route name (e.g. `ops.execute`) |
| `method` | string | yes | HTTP method |
| `actor_id` | string | yes | Principal ID or `(unauthenticated)` |
| `resolved_role` | string | yes | Principal role or `(none)` |
| `relevant_permission` | string | yes | Permission string being checked |
| `decision_type` | string | yes | Semantic decision type (see below) |
| `decision_outcome` | string | yes | `allow` or `deny` |
| `status_code` | number | yes | HTTP status implied by decision |
| `reason_code` | string | yes | Human-readable reason |
| `source_component` | string | yes | Always `prowork.authz` |
| `evidence_version` | string | yes | Schema version (currently `1.0`) |

---

## Decision Types

| Constant | String Value | Meaning |
|----------|-------------|---------|
| `ADMIN_READ` | `admin.read` | Admin resource read access |
| `OPS_READ` | `ops.read` | Ops status read |
| `OPS_EXECUTE` | `ops.execute` | Ops execute action |
| `OPS_RETRY` | `ops.retry` | Ops retry action |
| `OPS_OVERRIDE` | `ops.override` | Ops override action (superadmin only) |
| `PERM_ALLOWED` | `permission.allowed` | Generic permission allow |
| `PERM_DENIED` | `permission.denied` | Generic permission deny |
| `PERM_MISSING` | `permission.mapping.missing` | No mapping for permission |

## Decision Outcomes
- `allow` — principal was authorized
- `deny` — principal was denied (403) or unauthenticated (401)

---

## Control Rules
- append-only JSONL — no in-place mutation of prior entries
- `correlation_id` and `request_id` required on every privileged record
- deny records are mandatory evidence (not optional)
- exported artifacts preserve ordering
- source JSONL is not altered during export
