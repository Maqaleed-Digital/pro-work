# PROWORK — OPERATIONAL CONTROL EVIDENCE CONTRACT

Version: 1.0
Status: ACTIVE
Phase: 11

---

## Required Evidence Labels

| Label | Route | Method | Role | Expected Status |
|-------|-------|--------|------|----------------|
| PERM-PUBLIC-ALLOW | /api/health | GET | (none) | 200 |
| PERM-IDENTITY-ALLOW | /api/admin/version | GET | superadmin | 200 |
| PERM-ADMIN-READ-ALLOW | /api/admin/governance | GET | superadmin | 200 |
| PERM-OPS-READ-ALLOW | /api/ops/status | GET | ops | 200 |
| PERM-OPS-EXECUTE-DENY-AUDITOR | /api/ops/execute | POST | auditor | 403 |
| PERM-OPS-EXECUTE-ALLOW-OPS | /api/ops/execute | POST | ops | 202 |
| PERM-OPS-EXECUTE-ALLOW-SUPERADMIN | /api/ops/execute | POST | superadmin | 202 |
| PERM-OPS-RETRY-DENY-AUDITOR | /api/ops/retry | POST | auditor | 403 |
| PERM-OPS-RETRY-ALLOW-OPS | /api/ops/retry | POST | ops | 202 |
| PERM-OPS-OVERRIDE-DENY-OPS | /api/ops/override | POST | ops | 403 |
| PERM-OPS-OVERRIDE-ALLOW-SUPERADMIN | /api/ops/override | POST | superadmin | 202 |
| PERM-DENY-MISSING-PERMISSION-MAPPING | /api/ops/execute | POST | (no token) | 401 |

---

## Required Per-Case Artifact Fields
- timestamp
- route
- method
- expected_status
- actual_status
- resolved_role
- required_permission
- decision
- result (PASS / FAIL)

---

## Output Contract
Evidence runner must create a timestamped directory containing:
- `summary.json` — machine-readable pass/fail per label
- `decision_log.txt` — all permission decisions with actor/role/permission/result
- `command_log.txt` — raw curl commands and responses
- `manifest.txt` — deterministic inventory of all artifacts

## Fail Rule
Any mismatch between expected and actual status, any missing artifact, or any missing decision context must cause the runner to exit non-zero.
