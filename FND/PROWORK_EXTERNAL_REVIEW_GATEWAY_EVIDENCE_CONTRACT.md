# PROWORK — EXTERNAL REVIEW GATEWAY EVIDENCE CONTRACT

Version: 1.0
Status: ACTIVE
Phase: 18

---

## Required Evidence Labels

| Label | Route | Method | Expected Status |
|-------|-------|--------|----------------|
| EXTERNAL-REVIEW-CONTEXT-LOADED | /api/admin/external-review/export | GET | 200 |
| EXTERNAL-REVIEW-EXPORT-GENERATED | /api/admin/external-review/export | GET | 200 (artifact saved) |
| EXTERNAL-REVIEW-DENY-MISSING-SESSION | /external-review/evidence | GET | 403 (no X-Review-Session-Id) |
| EXTERNAL-REVIEW-DENY-EXPIRED-SESSION | /external-review/evidence | GET | 403 (expired session) |
| EXTERNAL-REVIEW-DENY-REVOKED-SESSION | /external-review/evidence | GET | 403 (revoked session) |
| EXTERNAL-REVIEW-DENY-SCOPE-MISMATCH | /external-review/audit | GET | 403 (evidence.read session, audit.read required) |
| EXTERNAL-REVIEW-DENY-CROSS-TENANT | /external-review/evidence | GET | 403 (wrong tenant) |
| EXTERNAL-REVIEW-DENY-INCOMPATIBLE-JURISDICTION | /external-review/evidence | GET | 403 (GCC request, KSA session) |
| EXTERNAL-REVIEW-ALLOW-IN-SCOPE | /external-review/evidence | GET | 200 (valid session, correct scope) |
| EXTERNAL-REVIEW-DENY-MUTATION | /external-review/mutation-test | POST | 403 |
| EXTERNAL-REVIEW-DISCLOSURE-BOUND-ENFORCED | /external-review/disclosure-export | GET | 200 (disclosure basis validated) |
| EXTERNAL-REVIEW-LEGAL-HOLD-ENFORCED | /external-review/disclosure-export | GET | 403 (active legal hold) |
| EXTERNAL-REVIEW-METADATA-PRESENT | server.log | — | reviewer_type in log |
| EXTERNAL-REVIEW-UNKNOWN-REVIEWER-DENIED | /external-review/evidence | GET | 403 (unknown reviewer type in crafted session) |

---

## Output Contract

Evidence runner must produce:
- `summary.json` — machine-readable pass/fail per label
- `decision_log.txt` — per-case records with external review metadata
- `command_log.txt` — raw HTTP commands and responses
- `external_review_gateway_export.json` — exported gateway artifact
- `unit_p18.txt` — unit test TAP output
- per-case `<LABEL>.json` files
- `manifest.txt` — deterministic file inventory

---

## Fail Rule

Any mismatch, missing governance metadata, failed denial enforcement,
missing session/scope/tenant/jurisdiction check, or missing export artifact
must exit non-zero.
