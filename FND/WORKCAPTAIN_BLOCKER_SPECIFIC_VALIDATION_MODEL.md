# WORKCAPTAIN BLOCKER-SPECIFIC VALIDATION MODEL

## Hard Rule
Each blocker stands on its own evidence. No blocker may inherit closure from another blocker.

## Required Evidence Fields
- gap_id
- evidence_id
- evidence_type
- evidence_path
- submitted_by
- submitted_at_utc
- validation_note
- evidence_validated

## Closure Rule
RESOLVED only when:
- all required fields are populated
- evidence_validated equals true
- validation passes
- human approval remains required

## Readiness Rule
Certification rerun readiness is TRUE only when all blocker rows are RESOLVED.
