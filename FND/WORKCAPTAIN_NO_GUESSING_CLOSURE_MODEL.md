# WORKCAPTAIN NO-GUESSING CLOSURE MODEL

## Hard Rule
If evidence is not explicitly submitted, the blocker is not closed.

## Validation Requirements
A blocker may be marked RESOLVED only if all of the following are present:
- evidence_id
- evidence_type
- evidence_path
- submitted_by
- submitted_at_utc
- validation_note
- evidence_validated = true

## Forbidden Behaviors
- assuming closure from intent
- assuming closure from narrative text alone
- assuming closure from missing or partial fields
- changing readiness without evidence-backed validation

## Output Integrity Rule
Readiness must be computed only from validated blocker states.
