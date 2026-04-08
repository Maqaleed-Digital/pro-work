# PROWORK — TENANT / JURISDICTION EVIDENCE CONTRACT

Version: 1.0
Status: ACTIVE
Phase: 15

---

## Required Evidence Labels

| Label | Route | Method | Role | Expected Status |
|-------|-------|--------|------|----------------|
| TENANT-CONTEXT-LOADED | /api/admin/tenant-governance | GET | superadmin | 200 |
| JURISDICTION-CONTEXT-LOADED | /api/admin/tenant-governance/jurisdictions | GET | superadmin | 200 |
| TENANT-GOVERNANCE-EXPORT-GENERATED | /api/admin/tenant-governance/export | GET | superadmin | 200 |
| TENANT-OVERRIDE-DENY-MISSING-TENANT | /api/ops/governed-override | POST | superadmin | 403 (no X-Tenant-Id) |
| TENANT-OVERRIDE-DENY-CROSS-TENANT | /api/ops/governed-override | POST | ops (tenant_a) | 403 (X-Tenant-Id: tenant_b) |
| TENANT-OVERRIDE-ALLOW-SAME-TENANT | /api/ops/governed-override | POST | superadmin (*) | 202 (correct tenant + approval) |
| JURISDICTION-DENY-MISSING-JURISDICTION | /api/ops/governed-override | POST | superadmin | 403 (no X-Jurisdiction-Code) |
| JURISDICTION-DENY-INCOMPATIBLE-JURISDICTION | /api/ops/governed-override | POST | superadmin | 403 (GCC on KSA tenant) |
| JURISDICTION-ALLOW-COMPATIBLE-JURISDICTION | /api/ops/governed-force-execute | POST | superadmin | 202 (KSA on KSA tenant + approval) |
| TENANT-APPROVAL-BINDING-ENFORCED | /api/ops/governed-override | POST | ops (tenant_a) | 403 (approval from another context) |
| JURISDICTION-POLICY-BOUND-ENFORCED | /api/admin/tenant-governance/:id/set-jurisdiction | POST | superadmin | 200 (KSA assigned) |
| TENANT-AUDIT-METADATA-PRESENT | server.log | — | — | tenant_id present in log |
| JURISDICTION-METADATA-PRESENT | server.log | — | — | jurisdiction_code present in log |
| TENANT-UNKNOWN-DENIED | /api/ops/governed-override | POST | superadmin | 403 (X-Tenant-Id: nonexistent) |
| JURISDICTION-UNKNOWN-DENIED | /api/ops/governed-override | POST | superadmin | 403 (X-Jurisdiction-Code: UNKNOWN) |

---

## Output Contract

Evidence runner must produce:
- `summary.json` — machine-readable pass/fail per label
- `decision_log.txt` — per-case records with tenant/jurisdiction metadata
- `command_log.txt` — raw HTTP commands and responses
- `tenant_governance_export.json` — exported tenant/jurisdiction artifact
- `unit_p15.txt` — unit test TAP output
- per-case `<LABEL>.json` files
- `manifest.txt` — deterministic file inventory

---

## Fail Rule

Any mismatch, missing tenant/jurisdiction metadata, failed cross-tenant denial,
failed jurisdiction incompatibility denial, or failed isolation verification must
exit non-zero.
