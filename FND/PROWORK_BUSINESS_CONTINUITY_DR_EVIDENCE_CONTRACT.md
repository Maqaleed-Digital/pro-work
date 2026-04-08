# PROWORK — BUSINESS CONTINUITY / DISASTER RECOVERY EVIDENCE CONTRACT

Version: 1.0
Status: ACTIVE
Phase: 20

---

## Required Evidence Labels

| Label | Route | Method | Expected Status |
|-------|-------|--------|----------------|
| CONTINUITY-CONTEXT-LOADED | /api/admin/continuity-governance | GET | 200 |
| DR-CONTEXT-LOADED | /api/admin/continuity-governance | GET | 200 (recovery_state present) |
| CONTINUITY-EXPORT-GENERATED | /api/admin/continuity-governance/export | GET | 200 |
| CONTINUITY-DENY-MISSING-MODE | /api/ops/governed-continuity-exec | POST | 403 (no X-Continuity-Mode) |
| CONTINUITY-DENY-UNKNOWN-MODE | /api/ops/governed-continuity-exec | POST | 403 (unknown mode) |
| CONTINUITY-ALLOW-NORMAL | /api/ops/governed-continuity-exec | POST | 202 (normal + standby) |
| CONTINUITY-DEGRADED-RESTRICTION-ENFORCED | /api/ops/governed-continuity-exec | POST | 403 (degraded mode) |
| DR-DENY-MISSING-STATE | /api/ops/governed-continuity-exec | POST | 403 (no X-Recovery-State) |
| DR-DENY-UNKNOWN-STATE | /api/ops/governed-continuity-exec | POST | 403 (unknown state) |
| DR-ACTIVE-RECOVERY-RESTRICTION-ENFORCED | /api/ops/governed-continuity-exec | POST | 403 (active_recovery) |
| DR-RESTORED-ALLOW | /api/ops/governed-continuity-exec | POST | 202 (normal + restored) |
| CONTINUITY-DR-METADATA-PRESENT | server.log | — | continuity_mode in log |
| INCIDENT-CONTAINMENT-PRECEDENCE-PRESERVED | /api/ops/governed-continuity-exec | POST | 403 (critical incident overrides normal mode) |
| CONTINUITY-DR-POLICY-BOUND-ENFORCED | /api/admin/continuity-governance/mode | POST | 200 |

---

## Output Contract

Evidence runner must produce:
- `summary.json` — machine-readable pass/fail per label
- `decision_log.txt` — per-case records with continuity/DR metadata
- `command_log.txt` — raw HTTP commands and responses
- `continuity_dr_export.json` — exported continuity/DR artifact
- `unit_p20.txt` — unit test TAP output
- per-case `<LABEL>.json` files
- `manifest.txt` — deterministic file inventory

---

## Fail Rule

Any mismatch, missing continuity/DR metadata, failed denial enforcement,
missing export artifact, or failed incident precedence check must exit non-zero.
