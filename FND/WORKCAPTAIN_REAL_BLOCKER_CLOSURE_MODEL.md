# WORKCAPTAIN REAL BLOCKER CLOSURE MODEL

## Hard Rule
A blocker is not closed until real evidence exists and real approval exists.

## Submission File
ops/phase84_blocker_submissions.json

## Required Per-Blocker Fields
- gap_id
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
RESOLVED only when:
- evidence_path exists
- approval_path exists
- approved = true
- approved_by present
- approved_at_utc present
- approval_comment present

## Readiness Rule
Certification rerun readiness is TRUE only when all blockers are RESOLVED.
