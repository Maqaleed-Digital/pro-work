# PROWORK — INCIDENT CONTAINMENT EVIDENCE CONTRACT

Version: 1.0
Status: ACTIVE
Phase: 19

---

## Required Evidence Labels

| Label | Route | Method | Expected Status |
|-------|-------|--------|----------------|
| INCIDENT-CONTEXT-LOADED | /api/admin/incidents/export | GET | 200 |
| INCIDENT-DECLARED | /api/admin/incidents | POST | 201 |
| INCIDENT-CONTAINMENT-ACTIVE | /api/admin/incidents/export | GET | 200 (containment_active=true) |
| INCIDENT-CONTAINMENT-BLOCK | /api/ops/governed-containment-exec | POST | 403 (critical incident active) |
| INCIDENT-CONTAINMENT-ALLOW | /api/ops/governed-containment-exec | POST | 202 (no critical incident) |
| INCIDENT-RESOLVED | /api/admin/incidents/:id/resolve | POST | 200 |
| INCIDENT-METADATA-PRESENT | server.log | — | incident_severity in log |

---

## Output Contract

Evidence runner must produce:
- `summary.json` — machine-readable pass/fail per label
- `decision_log.txt` — per-case records with incident metadata
- `command_log.txt` — raw HTTP commands and responses
- `incident_governance_export.json` — exported incident artifact
- `unit_p19.txt` — unit test TAP output
- per-case `<LABEL>.json` files
- `manifest.txt` — deterministic file inventory

---

## Fail Rule

Any mismatch, missing containment enforcement, missing metadata in logs,
missing export artifact, or failed allow/deny must exit non-zero.
