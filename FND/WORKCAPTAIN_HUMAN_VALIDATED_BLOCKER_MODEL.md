# WORKCAPTAIN HUMAN-VALIDATED BLOCKER MODEL

## Hard Rule
Evidence alone is not enough. Human validation is required for closure.

## Required Evidence Fields
- gap_id
- evidence_id
- evidence_type
- evidence_path
- submitted_by
- submitted_at_utc
- validation_note

## Required Human Validation Fields
- human_validation_status
- human_validated_by
- human_validated_at_utc
- human_validation_comment

## Closure Rule
A blocker is RESOLVED only when:
- all evidence fields are present
- human_validation_status = APPROVED
- human validation identity and timestamp are present

## Readiness Rule
Certification rerun readiness is TRUE only when all blocker rows are RESOLVED.
