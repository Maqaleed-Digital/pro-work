# PROWORK — APPROVAL CONTROL EVIDENCE CONTRACT

Version: 1.0
Status: ACTIVE
Phase: 13

---

## Required Evidence Labels

| Label | Route | Method | Role | Expected Status |
|-------|-------|--------|------|----------------|
| APPROVAL-REQUEST-CREATED | /api/approvals/request | POST | ops | 201 |
| APPROVAL-REQUEST-DENIED-WITHOUT-PRIVILEGE | /api/approvals/request | POST | auditor | 403 |
| APPROVAL-DECISION-APPROVED | /api/approvals/:id/approve | POST | superadmin | 200 |
| APPROVAL-DECISION-DENIED | /api/approvals/:id/deny | POST | superadmin | 200 |
| APPROVAL-OVERRIDE-DENY-NO-APPROVAL | /api/ops/override | POST | superadmin | 403 |
| APPROVAL-OVERRIDE-DENY-SELF-APPROVAL | /api/ops/override | POST | superadmin | 403 |
| APPROVAL-OVERRIDE-ALLOW-WITH-APPROVAL | /api/ops/override | POST | superadmin | 202 |
| APPROVAL-FORCE-EXECUTE-DENY-NO-APPROVAL | /api/ops/force-execute | POST | ops | 403 |
| APPROVAL-FORCE-EXECUTE-ALLOW-WITH-APPROVAL | /api/ops/force-execute | POST | ops | 202 |
| APPROVAL-CONFIG-CHANGE-DENY-NO-APPROVAL | /api/admin/config-change | POST | superadmin | 403 |
| APPROVAL-CONFIG-CHANGE-ALLOW-WITH-APPROVAL | /api/admin/config-change | POST | superadmin | 202 |
| APPROVAL-REPLAY-DENIED | /api/ops/force-execute | POST | ops | 403 |
| APPROVAL-AUDIT-BINDING-PRESENT | export artifact | — | — | present |
| APPROVAL-EXPORT-GENERATED | export artifact | — | — | present |

## Output Contract
Evidence runner must produce:
- `summary.json` — machine-readable pass/fail per label
- `decision_log.txt` — per-case records with approval metadata
- `command_log.txt` — raw HTTP commands and responses
- `approval_export.json` — exported approval artifact (requests + decisions)
- `manifest.txt` — deterministic file inventory

## Fail Rule
Any mismatch, missing approval metadata, failed replay denial, or failed binding verification must exit non-zero.
