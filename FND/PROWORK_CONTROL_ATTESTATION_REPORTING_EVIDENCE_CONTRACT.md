# PROWORK — CONTROL ATTESTATION / COMPLIANCE REPORTING EVIDENCE CONTRACT

Version: 1.0
Status: ACTIVE
Phase: 22

---

## Required Evidence Labels

| Label | Route | Method | Expected Status |
|-------|-------|--------|----------------|
| ATTESTATION-CONTEXT-LOADED | /api/admin/control-attestation | GET | 200 |
| ATTESTATION-EXPORT-GENERATED | /api/admin/control-attestation/export | GET | 200 |
| REPORT-CONTEXT-LOADED | /api/admin/compliance-report | GET | 200 |
| REPORT-EXPORT-GENERATED | /api/admin/compliance-report/export | GET | 200 |
| ATTESTATION-DENY-MISSING-CONTROL-STATUS | /api/admin/control-attestation/record | POST | 422 (missing status) |
| ATTESTATION-DENY-UNKNOWN-STATUS | /api/admin/control-attestation/record | POST | 422 (unknown status) |
| ATTESTATION-PASS-RECORDED | /api/admin/control-attestation/record | POST | 201 (status=pass) |
| ATTESTATION-DEGRADED-RECORDED | /api/admin/control-attestation/record | POST | 201 (status=degraded) |
| REPORT-DENY-MISSING-CRITICAL-ATTESTATION | /api/admin/compliance-report/generate | POST | 422 (critical families not attested) |
| REPORT-DENY-UNKNOWN-REPORT-TYPE | /api/admin/compliance-report/generate | POST | 422 (unknown type) |
| REPORT-GENERATE-GOVERNANCE-CONTROL | /api/admin/compliance-report/generate | POST | 201 (governance.control_report) |
| REPORT-GENERATE-TENANT-COMPLIANCE | /api/admin/compliance-report/generate | POST | 201 (tenant.compliance_report) |
| REPORT-GENERATE-JURISDICTION-COMPLIANCE | /api/admin/compliance-report/generate | POST | 201 (jurisdiction.compliance_report) |
| REPORT-GENERATE-INCIDENT-ASSURANCE | /api/admin/compliance-report/generate | POST | 201 (incident.assurance_report) |
| ATTESTATION-REPORT-METADATA-PRESENT | attestation+report exports | CHECK | 200 (control_id + report_type present) |

---

## Output Contract

Evidence runner must produce:
- `summary.json` — machine-readable pass/fail per label
- `decision_log.txt` — per-case records with attestation/report metadata
- `command_log.txt` — raw HTTP commands and responses
- `control_attestation_export.json` — exported attestation governance artifact
- `compliance_report_export.json` — exported report governance artifact
- `unit_p22.txt` — unit test TAP output
- per-case `<LABEL>.json` files
- `manifest.txt` — deterministic file inventory

---

## Fail Rule

Any mismatch, missing artifact, missing attestation/report metadata, failed denial enforcement,
or missing critical attestation check must exit non-zero.
