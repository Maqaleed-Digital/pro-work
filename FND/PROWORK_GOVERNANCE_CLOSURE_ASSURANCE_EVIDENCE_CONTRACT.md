# PROWORK — GOVERNANCE CLOSURE / EXECUTIVE ASSURANCE EVIDENCE CONTRACT

Version: 1.0
Status: ACTIVE
Phase: 23

---

## Required Evidence Labels

| Label | Route | Method | Expected Status |
|-------|-------|--------|----------------|
| CLOSURE-CONTEXT-LOADED | /api/admin/governance-closure | GET | 200 |
| CLOSURE-EXPORT-GENERATED | /api/admin/governance-closure/export | GET | 200 |
| ASSURANCE-CONTEXT-LOADED | /api/admin/executive-assurance-pack | GET | 200 |
| ASSURANCE-EXPORT-GENERATED | /api/admin/executive-assurance-pack/export | GET | 200 |
| CLOSURE-DENY-MISSING-CRITICAL-EVIDENCE | /api/admin/governance-closure/record | POST | 422 (ready without evidence) |
| CLOSURE-DENY-UNKNOWN-STATUS | /api/admin/governance-closure/record | POST | 422 (unknown status) |
| CLOSURE-READY-RECORDED | /api/admin/governance-closure/record | POST | 201 (status=ready) |
| CLOSURE-BLOCKED-RECORDED | /api/admin/governance-closure/record | POST | 201 (status=blocked) |
| ASSURANCE-DENY-MISSING-CLOSURE | /api/admin/executive-assurance-pack/record | POST | 422 (no closure_id) |
| ASSURANCE-DENY-UNKNOWN-STATUS | /api/admin/executive-assurance-pack/record | POST | 422 (unknown status) |
| ASSURANCE-VALIDATED-RECORDED | /api/admin/executive-assurance-pack/record | POST | 201 (status=validated) |
| ASSURANCE-ISSUED-RECORDED | /api/admin/executive-assurance-pack/record | POST | 201 (status=issued) |
| CLOSURE-GENERATE-TENANT | /api/admin/governance-closure/tenant | GET | 200 (?tenant_id=) |
| CLOSURE-GENERATE-JURISDICTION | /api/admin/governance-closure/jurisdiction | GET | 200 (?jurisdiction_code=) |
| ASSURANCE-SUMMARY-GENERATED | /api/admin/executive-assurance-pack/summary | GET | 200 |
| CLOSURE-ASSURANCE-METADATA-PRESENT | closure+assurance exports | CHECK | 200 (closure_id + assurance_status present) |

---

## Output Contract

Evidence runner must produce:
- `summary.json` — machine-readable pass/fail per label
- `decision_log.txt` — per-case records with closure/assurance metadata
- `command_log.txt` — raw HTTP commands and responses
- `governance_closure_export.json` — exported closure artifact
- `executive_assurance_export.json` — exported assurance pack artifact
- `unit_p23.txt` — unit test TAP output
- per-case `<LABEL>.json` files
- `manifest.txt` — deterministic file inventory

---

## Fail Rule

Any mismatch, missing artifact, missing closure/assurance metadata, failed denial enforcement,
missing critical evidence check, or missing closure reference check must exit non-zero.
