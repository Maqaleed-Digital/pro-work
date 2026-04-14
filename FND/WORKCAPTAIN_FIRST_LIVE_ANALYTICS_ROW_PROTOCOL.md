# WORKCAPTAIN — FIRST LIVE ANALYTICS ROW PROTOCOL
#
# Status: ACTIVE

## Purpose

After rebuilding and redeploying Cloud Run services with Phase 98 emitter code,
trigger live paths to produce the first BigQuery analytics row.

## Trigger Sequence

1. Frontend trigger: `curl https://workcaptain.ai`
   - Hits Next.js RootLayout → emits page_view to raw_frontend_events

2. Backend trigger: `curl https://api.workcaptain.ai/analytics/bootstrap`
   - Hits getAnalyticsBootstrapStatus() → emits PROJECT_CREATED to raw_platform_events

3. Phase 97 rerun: validates first row present in BigQuery

## Success Gate

Phase 97 rerun output contains `STATUS_CODE=PASS`.

## Fallback Trigger Candidates (backend)

- https://api.workcaptain.ai/analytics/bootstrap
- https://api.workcaptain.ai/api/analytics/bootstrap
- https://api.workcaptain.ai/health

## Emitter Modules

- `src/lib/analytics/bigqueryEventWriter.ts` — shared BQ write functions
- `src/lib/analytics/frontendEmitter.ts` — emits to raw_frontend_events
- `src/lib/analytics/platformEmitter.ts` — emits to raw_platform_events
