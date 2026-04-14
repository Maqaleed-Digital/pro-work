# WORKCAPTAIN — PHASE 98
# APPLICATION-SIDE BIGQUERY EVENT WRITES TO RAW TABLES
#
# Status: READY FOR EXECUTION
# Applies From: Post-Phase 97 zero-live-events state
# Source of Truth Baseline: cf94581076d8c216050858056238c606a14062f9

## 1. Objective

Phase 98 implements actual application-side writes into:
- raw_frontend_events
- raw_platform_events

This phase must only wire runtime event writes when target files are discovered unambiguously.

## 2. No-Guessing Rule

If the repo contains:
- zero valid targets
or
- more than one ambiguous target
for either required runtime surface, execution must stop and record BLOCKED_AMBIGUOUS_TARGETS.

## 3. Required Runtime Surfaces

Frontend surface:
- route/render or app shell integration point

Backend/platform surface:
- API middleware, event publisher, or server-side runtime integration point

## 4. PASS Condition

PASS requires:
- shared BigQuery writer module created
- frontend emitter module created
- platform emitter module created
- exactly one frontend target patched
- exactly one backend target patched
- evidence recorded

## 5. Out of Scope

- guessing unknown file paths
- patching multiple candidate files
- seeding fake production rows
