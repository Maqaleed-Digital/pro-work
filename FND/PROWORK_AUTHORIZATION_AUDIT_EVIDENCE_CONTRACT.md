# PROWORK — AUTHORIZATION AUDIT EVIDENCE CONTRACT

Version: 1.0
Status: ACTIVE
Phase: 12

---

## Required Evidence Labels

| Label | Route | Method | Role | Expected Status |
|-------|-------|--------|------|----------------|
| AUDIT-AUTHZ-ALLOW-RECORDED | /api/admin/governance | GET | superadmin | 200 |
| AUDIT-AUTHZ-DENY-RECORDED | /api/ops/override | POST | ops | 403 |
| AUDIT-OPS-EXECUTE-ALLOW-RECORDED | /api/ops/execute | POST | ops | 202 |
| AUDIT-OPS-RETRY-ALLOW-RECORDED | /api/ops/retry | POST | ops | 202 |
| AUDIT-OPS-OVERRIDE-ALLOW-RECORDED | /api/ops/override | POST | superadmin | 202 |
| AUDIT-OPS-OVERRIDE-DENY-RECORDED | /api/ops/override | POST | ops | 403 |
| AUDIT-TRACE-ID-PRESENT | /api/ops/execute | POST | ops | 202 |
| AUDIT-CORRELATION-ID-PRESENT | /api/ops/execute | POST | ops | 202 |
| AUDIT-APPEND-ONLY-VERIFIED | (JSONL count check) | — | — | — |
| AUDIT-EXPORT-GENERATED | (export artifact) | — | — | — |
| AUDIT-MISSING-PERMISSION-MAPPING-DENY-RECORDED | /api/ops/execute | POST | (no token) | 401 |

---

## Required Per-Case Fields
- timestamp
- route
- method
- expected_status
- actual_status
- resolved_role
- required_permission
- decision_outcome
- audit_record_id (from JSONL)
- correlation_id (from response header)
- request_id (from response header)
- result (PASS / FAIL)

## Output Contract
Evidence runner must produce:
- `summary.json` — machine-readable pass/fail per label
- `decision_log.txt` — per-case decision records
- `command_log.txt` — raw HTTP commands and responses
- `audit_records_export.json` — exported audit artifact
- `manifest.txt` — deterministic file inventory

## Fail Rule
Any mismatch, missing audit record, missing header, or append-only violation must exit non-zero.
