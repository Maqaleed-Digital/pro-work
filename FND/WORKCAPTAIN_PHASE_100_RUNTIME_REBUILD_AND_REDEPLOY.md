# WORKCAPTAIN — PHASE 100: RUNTIME REBUILD AND REDEPLOY
#
# Status: ACTIVE

## Purpose

Rebuild Cloud Run container images from current source tree (which includes Phase 98
BigQuery emitter modules) and redeploy both `web-service` and `api-service` to
`prj-maq-workcaptain-nonprod / me-central2`.

Phase 98 wrote TypeScript BigQuery emitter code into:
- `prowork_runtime/web/src/app/layout.tsx` — frontend page_view events
- `prowork_runtime/api/src/analytics/bootstrap.ts` — platform lifecycle events

Those emitters are in the source tree but NOT in the currently running container images.
This phase rebuilds + redeploys so the live containers carry the emitter code.

## Services

| Service     | Source Dir              | Required Env Vars                                          |
|-------------|-------------------------|------------------------------------------------------------|
| web-service | prowork_runtime/web     | API_ORIGIN, WORKCAPTAIN_BQ_PROJECT_ID, WORKCAPTAIN_BQ_DATASET |
| api-service | prowork_runtime/api     | API_ADMIN_TOKEN, API_OPERATOR_TOKEN, API_VIEWER_TOKEN, WORKCAPTAIN_BQ_PROJECT_ID, WORKCAPTAIN_BQ_DATASET |

## Execution

```
python3 scripts/workcaptain_phase100_runtime_rebuild_redeploy.py <evidence_dir>
```

## Gate Chain

BLOCKED_WEB_BUILD_FAILURE → BLOCKED_API_BUILD_FAILURE → BLOCKED_TRIGGER_FAILURE → BLOCKED_PHASE97_FAILURE → PASS

## Success Criterion

Phase 97 rerun returns STATUS_CODE=PASS (first analytics row confirmed in BigQuery).
