# PHASE 72 — ADVISORY INTELLIGENCE EXECUTION PACK

Status: ACTIVE_EXECUTION_PACK
Authority: Phase 72
Depends On: Phase 71 governance_metrics.json

## 1. Purpose
Phase 72 applies advisory threshold rules to Phase 71 governance metrics and produces structured advisory signals and recommendations. No runtime state is mutated.

## 2. Objectives
- Read governance_metrics.json produced by Phase 71.
- Apply advisory_thresholds.json rules.
- Produce advisory_signals.json with severity levels: INFO / WATCH / ACTION / CRITICAL.
- Produce advisory_recommendations.json.
- Produce PHASE72_SUMMARY.md.

## 3. Severity Definitions
- `INFO`: metric within normal range, no action required.
- `WATCH`: metric approaching threshold, monitoring recommended.
- `ACTION`: threshold crossed, corrective action required.
- `CRITICAL`: threshold significantly exceeded, escalation required.

## 4. Hard Rules
- No HTTP calls.
- Fail closed if governance_metrics.json is missing or unreadable.
- Fail closed if advisory_thresholds.json is missing or unreadable.
- No silent advisory success without evidence.
- All signal severities must map to defined threshold rules.

## 5. Evidence Outputs
- `advisory_signals.json`
- `advisory_recommendations.json`
- `PHASE72_SUMMARY.md`

## 6. Exit Criteria
Phase 72 is complete when advisory_signals.json and advisory_recommendations.json are written with content derived from Phase 71 metrics and advisory threshold rules.
