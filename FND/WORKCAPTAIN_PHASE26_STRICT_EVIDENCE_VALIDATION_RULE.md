# WORKCAPTAIN / PROWORK — PHASE 26 STRICT EVIDENCE VALIDATION RULE

Version: 1.0
Status: ACTIVE

## Rule

Phase 27 readiness and all later phases are valid only if Phase 26 evidence is:

- resolved to a real timestamped path
- free of placeholder text
- present on disk
- supported by MANIFEST.sha256
- paired with required evidence files

## Blocking Condition

If any of the above is missing, downstream readiness must be blocked.
