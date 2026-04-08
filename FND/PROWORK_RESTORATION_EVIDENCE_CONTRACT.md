# PROWORK — RESTORATION EVIDENCE CONTRACT

Version: 1.0
Status: ACTIVE
Phase: 21

---

## Required Evidence Labels

| Label | Route | Method | Expected Status |
|-------|-------|--------|----------------|
| RESTORATION-INITIATED | /api/admin/restorations | POST | 201 (with approved_by) |
| RESTORATION-PHASE-APPLIED | /api/admin/restorations/:id/phase | POST | 200 (pending → in_progress) |
| RESTORATION-DENIED-NO-APPROVAL | /api/admin/restorations | POST | 422 (missing approved_by) |
| RESTORATION-DENIED-NO-CONTEXT | /api/ops/governed-restoration-exec | POST | 403 (no X-Restoration-Id) |
| ASSURANCE-STARTED | /api/admin/restorations/:id/assurance/start | POST | 200 |
| ASSURANCE-PASSED | /api/admin/restorations/:id/assurance/verify | POST | 200 (passed=true → validated) |
| ASSURANCE-FAILED | /api/admin/restorations/:id/assurance/verify | POST | 200 (passed=false → reverts to pending) |
| RESTORATION-COMPLETED | /api/admin/restorations/:id/complete | POST | 200 (validated → completed) |

---

## Output Contract

Evidence runner must produce:
- `summary.json` — machine-readable pass/fail per label
- `decision_log.txt` — per-case records with restoration metadata
- `command_log.txt` — raw HTTP commands and responses
- `restoration_export.json` — exported restoration governance artifact
- `unit_p21.txt` — unit test TAP output
- per-case `<LABEL>.json` files
- `manifest.txt` — deterministic file inventory

---

## Fail Rule

Any mismatch, missing restoration metadata, failed denial enforcement,
missing export artifact, or failed assurance enforcement must exit non-zero.
