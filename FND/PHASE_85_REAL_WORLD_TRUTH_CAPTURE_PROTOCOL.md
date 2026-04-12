# PHASE 85 — REAL-WORLD TRUTH CAPTURE PROTOCOL

Status: ACTIVE_TRUTH_CAPTURE_PROTOCOL  
Applies From Commit: 3aacb43

## Objective
Capture real uplift truth for the three remaining full-certification gaps using explicit values, real evidence files, and explicit approved governance records.

## No-Guessing Rule
- Do not invent uplift values.
- Do not use placeholder paths.
- Do not mark approval true unless a real approver has approved.
- Do not submit evidence that does not physically exist in the repository.

## Remaining Gaps
1. confidence_below_full_certification
2. coverage_ratio_below_full_certification
3. p0_count_above_zero

## What Must Be True
### confidence_below_full_certification
- uplift_value must be >= 0.75
- evidence must show the basis for the increased confidence
- approval must explicitly accept the uplift basis

### coverage_ratio_below_full_certification
- uplift_value must be >= 0.80
- evidence must show real portfolio scope or real project availability change
- approval must explicitly accept the coverage basis

### p0_count_above_zero
- uplift_value must be <= 0
- evidence must show both remaining P0 items are genuinely eliminated or formally reclassified through approved governance
- approval must explicitly accept the P0 resolution basis

## Required Input File
- /Users/waheebmahmoud/dev/pro-work/ops/phase85_full_cert_gap_uplift.json

## Required Approval Files
- /Users/waheebmahmoud/dev/pro-work/ops/approvals/phase85/confidence_approval.json
- /Users/waheebmahmoud/dev/pro-work/ops/approvals/phase85/coverage_approval.json
- /Users/waheebmahmoud/dev/pro-work/ops/approvals/phase85/p0_approval.json

## Required Supporting Evidence Files
Store real supporting evidence under:
- /Users/waheebmahmoud/dev/pro-work/ops/evidence/phase85/

## Acceptance Rule
Truth is accepted only when:
- all three rows in phase85_full_cert_gap_uplift.json are populated
- all referenced evidence files exist
- all referenced approval files exist and contain approved=true
- all uplift values satisfy their threshold
