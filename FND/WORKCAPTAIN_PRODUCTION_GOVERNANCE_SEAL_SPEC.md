# WORKCAPTAIN / PROWORK — PRODUCTION GOVERNANCE SEAL SPEC

Version: 1.0
Status: ACTIVE

## Purpose

Define the immutable production governance seal structure for WorkCaptain / ProWork.

## Seal Fields

- seal_version
- platform_identity
- source_of_truth_commit
- certification_timestamp_utc
- certification_targets
- certification_status
- evidence_run_dir
- control_coverage_summary
- risk_posture
- board_readiness
- enterprise_readiness
- sovereign_positioning
- declaration_boundary
- generated_by_script
- manifest_sha256

## Seal Rules

- Seal is generated only after all validation gates pass
- Seal status may only be certified or blocked at generation time
- Seal must include manifest sha256 for evidence pack integrity
- Seal cannot be edited after generation; rerun creates a new evidence directory

## Certification Boundary

The seal certifies governance completeness and production readiness posture of the platform according to the recorded artifacts and evidence.
It does not constitute legal advice, regulator endorsement, or external audit accreditation unless separately obtained.
