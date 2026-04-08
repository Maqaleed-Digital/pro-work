# PROWORK — SOVEREIGN CONTROL EVIDENCE CONTRACT

Version: 1.0
Status: ACTIVE
Phase: 14

---

## Required Evidence Labels

| Label | Route / Context | Method | Role | Expected Status |
|-------|----------------|--------|------|----------------|
| POLICY-REGISTRY-LOADED | /api/admin/policy-registry | GET | superadmin | 200 |
| POLICY-CONTROL-VERSION-PRESENT | /api/admin/policy-registry | GET | superadmin | 200 (version_control present) |
| POLICY-RUNTIME-GUARD-FAIL-CLOSED | /api/admin/policy-registry | GET | superadmin | 200 (runtime_guard entry active) |
| POLICY-UNKNOWN-CONTROL-DENIED | /api/admin/policy-registry/:key/disable (unknown) | POST | superadmin | 422 |
| POLICY-SOVEREIGN-CONTROL-GATES-OPS-OVERRIDE | /api/ops/override | POST | superadmin | 403 (no approval) → 202 (with approval) |
| POLICY-SOVEREIGN-CONTROL-GATES-FORCE-EXECUTE | /api/ops/force-execute | POST | ops | 403 (no approval) → 202 (with approval) |
| POLICY-SOVEREIGN-CONTROL-GATES-CONFIG-CHANGE | /api/admin/config-change | POST | superadmin | 403 (no approval) → 202 (with approval) |
| POLICY-REGISTRY-DISABLE-BLOCKS-EXECUTION | /api/ops/override | POST | superadmin | 403 (control disabled) |
| POLICY-REGISTRY-ENABLE-RESTORES-EXECUTION | /api/admin/policy-registry/:key/enable | POST | superadmin | 200 |
| POLICY-REGISTRY-EXPORT-GENERATED | /api/admin/policy-registry/export | GET | superadmin | 200 (artifact valid) |
| POLICY-REGISTRY-LIST-ALL-REQUIRED-KEYS | /api/admin/policy-registry | GET | superadmin | 200 (≥7 entries) |
| POLICY-REGISTRY-UNAUTHORIZED-DENIED | /api/admin/policy-registry | GET | auditor | 403 |
| POLICY-REGISTRY-EXPORT-ARTIFACT | export artifact | — | — | present |

## Output Contract

Evidence runner must produce:
- `summary.json` — machine-readable pass/fail per label
- `decision_log.txt` — per-case records with registry metadata
- `command_log.txt` — raw HTTP commands and responses
- `registry_export.json` — exported registry artifact
- `unit_p14.txt` — unit test TAP output
- `manifest.txt` — deterministic file inventory

## Fail Rule

Any mismatch, missing sovereign control, unauthorized access bypass, or failed
disable/enable cycle must exit non-zero.
