# PROWORK — DATA RESIDENCY / RETENTION EVIDENCE CONTRACT

Version: 1.0
Status: ACTIVE
Phase: 16

---

## Required Evidence Labels

| Label | Route | Method | Expected Status |
|-------|-------|--------|----------------|
| RESIDENCY-CONTEXT-LOADED | /api/admin/evidence-governance/residency | GET | 200 |
| RETENTION-CONTEXT-LOADED | /api/admin/evidence-governance/retention | GET | 200 |
| EVIDENCE-GOVERNANCE-EXPORT-GENERATED | /api/admin/evidence-governance/export | GET | 200 |
| RESIDENCY-DENY-MISSING-REGION | /api/ops/governed-evidence-write | POST | 403 (no X-Residency-Region) |
| RESIDENCY-DENY-INCOMPATIBLE-REGION | /api/ops/governed-evidence-write | POST | 403 (GCC on KSA tenant) |
| RESIDENCY-ALLOW-COMPATIBLE-REGION | /api/ops/governed-evidence-write | POST | 202 (KSA on KSA tenant) |
| RETENTION-DENY-MISSING-CLASS | /api/ops/governed-evidence-write | POST | 403 (no X-Retention-Class) |
| RETENTION-DENY-INACTIVE-CLASS | /api/ops/governed-evidence-write | POST | 403 (disabled class) |
| RETENTION-ALLOW-ACTIVE-CLASS | /api/ops/governed-evidence-write | POST | 202 (active class) |
| EVIDENCE-RETENTION-METADATA-PRESENT | server.log | — | retention_class in log |
| EVIDENCE-RESIDENCY-METADATA-PRESENT | server.log | — | residency_region in log |
| RETENTION-POLICY-BOUND-ENFORCED | /api/admin/evidence-governance/retention/:class/disable | POST | 200 |
| RESIDENCY-POLICY-BOUND-ENFORCED | /api/admin/evidence-governance | GET | 200 (≥3 regions present) |
| RESIDENCY-UNKNOWN-DENIED | /api/ops/governed-evidence-write | POST | 403 (unknown region) |
| RETENTION-UNKNOWN-DENIED | /api/ops/governed-evidence-write | POST | 403 (unknown class) |

---

## Output Contract

Evidence runner must produce:
- `summary.json` — machine-readable pass/fail per label
- `decision_log.txt` — per-case records with residency/retention metadata
- `command_log.txt` — raw HTTP commands and responses
- `evidence_governance_export.json` — exported governance artifact
- `unit_p16.txt` — unit test TAP output
- per-case `<LABEL>.json` files
- `manifest.txt` — deterministic file inventory

---

## Fail Rule

Any mismatch, missing governance metadata, failed incompatible-residency denial,
failed inactive-retention denial, or missing export artifact must exit non-zero.
