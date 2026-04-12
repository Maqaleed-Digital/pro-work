# WORKCAPTAIN FULL CERT GAP CLOSURE MODEL

## Hard Rule
Full certification gaps are closed only by evidence-backed uplift, not by narrative intent.

## Gap Thresholds
- confidence >= 0.75
- coverage_ratio >= 0.80
- p0_count <= 0

## Required Per-Gap Submission Fields
- gap_id
- current_value
- target_value
- uplift_value
- evidence_path
- evidence_type
- submission_note
- approval_path

## Required Approval File JSON Fields
- approved
- approved_by
- approved_at_utc
- approval_comment

## Closure Rule
A gap is CLOSED only when:
- evidence_path exists
- approval_path exists
- approval JSON is valid and approved=true
- uplift_value satisfies the target threshold

## Readiness Rule
Final certification rerun is ready only when all three gaps are CLOSED.
