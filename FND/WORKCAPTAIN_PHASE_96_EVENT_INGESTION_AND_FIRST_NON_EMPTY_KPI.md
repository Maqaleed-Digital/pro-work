# WORKCAPTAIN — PHASE 96
# EVENT INGESTION ACTIVATION + RUNTIME INSTRUMENTATION WIRING + FIRST NON-EMPTY KPI OUTPUT
#
# Status: READY FOR EXECUTION
# Applies From: Post-analytics activation track PASS
# Source of Truth Baseline: d095cb29addb2543eb7e6bf34d1f18224ca1109a

## 1. Objective

Phase 96 activates real event ingestion into the live analytics warehouse and establishes the first non-empty executive KPI output path.

The warehouse, marts, and executive query are already live.
This phase focuses on the remaining operational reality:

- runtime instrumentation wiring
- arrival of real rows in raw event tables
- non-empty mart results
- first non-empty executive KPI output

## 2. Transition

FROM:
- warehouse live
- query path live
- executive query empty because raw tables are empty

TO:
- real events ingested
- raw tables non-empty
- marts populated
- executive KPI output non-empty

## 3. Scope

### 3.1 In Scope
- event ingestion activation contract
- runtime instrumentation wiring contract
- first non-empty KPI protocol
- event ingestion evidence contract
- ingestion targets registry
- non-empty KPI registry
- runtime status codes
- raw event presence SQL
- non-empty executive output SQL
- fail-closed validation runner

### 3.2 Out of Scope
- fabricated event rows presented as production data
- guessed runtime source paths beyond governed targets
- undocumented runtime mutation outside controlled wiring targets

## 4. Preferred First Non-Empty KPI Output

Required fields:
- event_date
- daily_active_users
- session_count
- api_request_volume
- milestones_completed_count
- evidence_packs_generated_count

## 5. Success Criteria

Phase 96 is complete when:
- ingestion targets are defined
- raw event presence check exists
- non-empty executive query exists
- validation runner records PASS or explicit blocked state
- evidence is produced
- source-of-truth commit is pushed
