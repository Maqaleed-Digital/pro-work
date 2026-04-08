# PROWORK — DISCLOSURE + LEGAL HOLD EVIDENCE CONTRACT

Version: 1.0
Status: ACTIVE
Phase: 17

---

## Required Evidence Labels

| Label | Route | Method | Expected Status |
|-------|-------|--------|----------------|
| DISCLOSURE-CONTEXT-LOADED | /api/admin/disclosure-governance/bases | GET | 200 |
| LEGAL-HOLD-CONTEXT-LOADED | /api/admin/disclosure-governance/legal-holds | GET | 200 |
| DISCLOSURE-EXPORT-GENERATED | /api/admin/disclosure-governance/export | GET | 200 |
| DISCLOSURE-POLICY-BOUND-ENFORCED | /api/admin/disclosure-governance/bases | GET | 200 (≥3 bases present) |
| LEGAL-HOLD-POLICY-BOUND-ENFORCED | /api/admin/disclosure-governance/legal-hold | POST | 201 |
| DISCLOSURE-DENY-MISSING-BASIS | /api/ops/governed-disclosure | POST | 403 (no X-Disclosure-Basis) |
| DISCLOSURE-UNKNOWN-DENIED | /api/ops/governed-disclosure | POST | 403 (unknown basis) |
| DISCLOSURE-DENY-OUT-OF-SCOPE | /api/ops/governed-disclosure | POST | 403 (internal.audit.review + full_export) |
| DISCLOSURE-ALLOW-IN-SCOPE | /api/ops/governed-disclosure | POST | 202 (regulatory.request + full_export) |
| DISCLOSURE-METADATA-PRESENT | server.log | — | disclosure_basis in log |
| LEGAL-HOLD-DENY-MISSING-STATE | /api/ops/governed-disposal | POST | 403 (no X-Legal-Hold-State) |
| LEGAL-HOLD-UNKNOWN-DENIED | /api/ops/governed-disposal | POST | 403 (unknown state) |
| LEGAL-HOLD-ALLOW-NONE | /api/ops/governed-disposal | POST | 202 (state=none, no active hold) |
| LEGAL-HOLD-BLOCK-ACTIVE-HOLD | /api/ops/governed-disposal | POST | 403 (active hold exists for tenant) |
| LEGAL-HOLD-ALLOW-RELEASED | /api/ops/governed-disposal | POST | 202 (hold released, no active hold) |
| LEGAL-HOLD-OVERRIDES-RETENTION | /api/ops/governed-disposal | POST | 403 (active hold blocks despite valid context) |
| LEGAL-HOLD-METADATA-PRESENT | server.log | — | legal_hold_state in log |

---

## Output Contract

Evidence runner must produce:
- `summary.json` — machine-readable pass/fail per label
- `decision_log.txt` — per-case records with disclosure/hold metadata
- `command_log.txt` — raw HTTP commands and responses
- `disclosure_governance_export.json` — exported governance artifact
- `unit_p17.txt` — unit test TAP output
- per-case `<LABEL>.json` files
- `manifest.txt` — deterministic file inventory

---

## Fail Rule

Any mismatch, missing governance metadata, failed out-of-scope denial,
failed active-hold block, or missing export artifact must exit non-zero.
