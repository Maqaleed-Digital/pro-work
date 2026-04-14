# WORKCAPTAIN — PHASE 99
# RUNTIME DEPLOY WITH BQ ENV + FIRST LIVE EVENT TRIGGER + FIRST REAL KPI OUTPUT
#
# Status: READY FOR EXECUTION
# Applies From: Post-Phase 98 app-side BigQuery writers implemented
# Source of Truth Baseline: 736024a4e0a67abd5f833133e61cf621a24073e6

## 1. Objective

Phase 99 completes analytics activation by deploying runtime with BigQuery environment variables, triggering the first live frontend/backend events, and confirming the first real KPI output.

## 2. No-Guessing Rule

Deployment wiring may only be patched if exactly one unambiguous deployment target is discovered.

If deployment targets are ambiguous or absent, execution must stop and record blocked status.

## 3. Required Runtime Env

- WORKCAPTAIN_BQ_PROJECT_ID=prj-maq-workcaptain-nonprod
- WORKCAPTAIN_BQ_DATASET=workcaptain_analytics

## 4. PASS Condition

PASS requires:
- one deployment target patched unambiguously
- deploy command discovered and executed
- frontend trigger executed
- backend trigger executed
- Phase 97 validation rerun returns PASS

## 5. Out of Scope

- guessing unknown deployment manifests
- patching multiple ambiguous deployment surfaces
- fabricating live rows or KPI output
