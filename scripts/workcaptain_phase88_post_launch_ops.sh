#!/usr/bin/env bash
set -euo pipefail

ROOT="${ROOT:?}"
PROJECT_ID="${PROJECT_ID:?}"
REGION="${REGION:?}"
API_SERVICE="${API_SERVICE:?}"
WEB_SERVICE="${WEB_SERVICE:?}"
DOMAIN_ROOT="${DOMAIN_ROOT:?}"
DOMAIN_WWW="${DOMAIN_WWW:?}"
DOMAIN_API="${DOMAIN_API:?}"
BRANCH_NAME="${BRANCH_NAME:?}"
STAMP="${STAMP:?}"
EVIDENCE_DIR="${EVIDENCE_DIR:?}"

UPTIME_WEB_CHECK="wc88-web-health-${STAMP}"
UPTIME_API_CHECK="wc88-api-health-${STAMP}"
CHANNEL_NAME="wc88-email-${STAMP}"
DASHBOARD_NAME="WorkCaptain Phase 88 Operations ${STAMP}"

mkdir -p "${EVIDENCE_DIR}"

log() { printf '%s %s\n' "[$(date -u +%H:%M:%SZ)]" "$*"; }

runlog() {
  local name="$1"
  shift
  {
    echo "\$ $*"
    "$@"
  } 2>&1 | tee "${EVIDENCE_DIR}/${name}.log"
}

log "PHASE 88 START"
runlog active_project gcloud config set project "${PROJECT_ID}"
runlog project_value gcloud config get-value project

log "Enable required APIs"
runlog enable_services gcloud services enable \
  monitoring.googleapis.com \
  logging.googleapis.com \
  cloudresourcemanager.googleapis.com \
  run.googleapis.com

log "Capture current live baseline"
runlog web_headers curl -sSI "https://${DOMAIN_ROOT}"
runlog api_headers curl -sSI "https://${DOMAIN_API}/health"
runlog api_docs_headers curl -sSI "https://${DOMAIN_API}/docs"

WEB_CODE="$(curl -s -o /dev/null -w "%{http_code}" "https://${DOMAIN_ROOT}")"
WWW_CODE="$(curl -s -o /dev/null -w "%{http_code}" "https://${DOMAIN_WWW}")"
WEB_HEALTH_CODE="$(curl -s -o /dev/null -w "%{http_code}" "https://${DOMAIN_ROOT}/health")"
API_HEALTH_CODE="$(curl -s -o /dev/null -w "%{http_code}" "https://${DOMAIN_API}/health")"
DOCS_CODE="$(curl -s -o /dev/null -w "%{http_code}" "https://${DOMAIN_API}/docs")"

printf 'WEB_CODE=%s\nWWW_CODE=%s\nWEB_HEALTH_CODE=%s\nAPI_HEALTH_CODE=%s\nDOCS_CODE=%s\n' \
  "${WEB_CODE}" "${WWW_CODE}" "${WEB_HEALTH_CODE}" "${API_HEALTH_CODE}" "${DOCS_CODE}" | tee "${EVIDENCE_DIR}/baseline_status.txt"

if [ "${WEB_CODE}" != "200" ] || [ "${WWW_CODE}" != "200" ] || [ "${WEB_HEALTH_CODE}" != "200" ] || [ "${API_HEALTH_CODE}" != "200" ] || [ "${DOCS_CODE}" != "200" ]; then
  echo "FAIL_CLOSED: live baseline validation failed" >&2
  exit 1
fi

log "Capture Cloud Run service baselines"
runlog api_service_describe gcloud run services describe "${API_SERVICE}" \
  --region "${REGION}" \
  --project "${PROJECT_ID}" \
  --format="yaml(metadata.name,status.url,status.conditions,status.latestReadyRevisionName)"

runlog web_service_describe gcloud run services describe "${WEB_SERVICE}" \
  --region "${REGION}" \
  --project "${PROJECT_ID}" \
  --format="yaml(metadata.name,status.url,status.conditions,status.latestReadyRevisionName)"

log "Create notification channel"
EMAIL_ADDR="$(gcloud config get-value account)"
cat > "${EVIDENCE_DIR}/notification_channel.json" <<JSON
{
  "type": "email",
  "displayName": "${CHANNEL_NAME}",
  "labels": {
    "email_address": "${EMAIL_ADDR}"
  }
}
JSON

CHANNEL_CREATE_OUTPUT="$(gcloud alpha monitoring channels create \
  --channel-content-from-file="${EVIDENCE_DIR}/notification_channel.json" \
  --project="${PROJECT_ID}" 2>&1 | tee "${EVIDENCE_DIR}/channel_create.log" || true)"

CHANNEL_ID="$(printf '%s' "${CHANNEL_CREATE_OUTPUT}" | sed -n 's#.*name: \(projects/.*/notificationChannels/[0-9]*\).*#\1#p' | tail -n 1)"
if [ -z "${CHANNEL_ID}" ]; then
  CHANNEL_ID="$(gcloud alpha monitoring channels list \
    --project="${PROJECT_ID}" \
    --format="value(name,displayName)" | awk -v n="${CHANNEL_NAME}" '$2==n{print $1}' | tail -n 1)"
fi
if [ -z "${CHANNEL_ID}" ]; then
  echo "FAIL_CLOSED: could not resolve notification channel id" >&2
  exit 1
fi
printf 'CHANNEL_ID=%s\n' "${CHANNEL_ID}" | tee "${EVIDENCE_DIR}/channel_id.txt"

log "Create uptime checks"
cat > "${EVIDENCE_DIR}/uptime_web.json" <<JSON
{
  "displayName": "${UPTIME_WEB_CHECK}",
  "httpCheck": {
    "path": "/health",
    "port": 443,
    "useSsl": true,
    "validateSsl": true
  },
  "monitoredResource": {
    "type": "uptime_url",
    "labels": {
      "host": "${DOMAIN_ROOT}",
      "project_id": "${PROJECT_ID}"
    }
  },
  "period": "60s",
  "timeout": "10s"
}
JSON

cat > "${EVIDENCE_DIR}/uptime_api.json" <<JSON
{
  "displayName": "${UPTIME_API_CHECK}",
  "httpCheck": {
    "path": "/health",
    "port": 443,
    "useSsl": true,
    "validateSsl": true
  },
  "monitoredResource": {
    "type": "uptime_url",
    "labels": {
      "host": "${DOMAIN_API}",
      "project_id": "${PROJECT_ID}"
    }
  },
  "period": "60s",
  "timeout": "10s"
}
JSON

runlog uptime_web_create gcloud monitoring uptime create "${UPTIME_WEB_CHECK}" \
  --resource-type=uptime-url \
  --resource-labels="host=${DOMAIN_ROOT},project_id=${PROJECT_ID}" \
  --path=/health \
  --port=443 \
  --protocol=https \
  --validate-ssl=true \
  --period=1 \
  --timeout=10 \
  --project="${PROJECT_ID}"

runlog uptime_api_create gcloud monitoring uptime create "${UPTIME_API_CHECK}" \
  --resource-type=uptime-url \
  --resource-labels="host=${DOMAIN_API},project_id=${PROJECT_ID}" \
  --path=/health \
  --port=443 \
  --protocol=https \
  --validate-ssl=true \
  --period=1 \
  --timeout=10 \
  --project="${PROJECT_ID}"

UPTIME_WEB_ID="$(sed -n 's#.*Created \[\(projects/[^]]*\)\].*#\1#p' "${EVIDENCE_DIR}/uptime_web_create.log" | tail -1)"
if [ -z "${UPTIME_WEB_ID}" ]; then
  UPTIME_WEB_ID="$(gcloud monitoring uptime list-configs --project="${PROJECT_ID}" \
    --format="value(name,displayName)" | awk -v n="${UPTIME_WEB_CHECK}" 'index($0,n){print $1}' | tail -1)"
fi

UPTIME_API_ID="$(sed -n 's#.*Created \[\(projects/[^]]*\)\].*#\1#p' "${EVIDENCE_DIR}/uptime_api_create.log" | tail -1)"
if [ -z "${UPTIME_API_ID}" ]; then
  UPTIME_API_ID="$(gcloud monitoring uptime list-configs --project="${PROJECT_ID}" \
    --format="value(name,displayName)" | awk -v n="${UPTIME_API_CHECK}" 'index($0,n){print $1}' | tail -1)"
fi

if [ -z "${UPTIME_WEB_ID}" ] || [ -z "${UPTIME_API_ID}" ]; then
  echo "FAIL_CLOSED: uptime checks not discoverable after creation" >&2
  exit 1
fi
printf 'UPTIME_WEB_ID=%s\nUPTIME_API_ID=%s\n' "${UPTIME_WEB_ID}" "${UPTIME_API_ID}" | tee "${EVIDENCE_DIR}/uptime_ids.txt"

log "Create alert policies"
cat > "${EVIDENCE_DIR}/alert_web_uptime.json" <<JSON
{
  "displayName": "WC88 Web Uptime Failure ${STAMP}",
  "documentation": {
    "content": "WorkCaptain web health endpoint is failing.",
    "mimeType": "text/markdown"
  },
  "conditions": [
    {
      "displayName": "Web uptime unhealthy",
      "conditionThreshold": {
        "filter": "metric.type=\"monitoring.googleapis.com/uptime_check/check_passed\" AND resource.type=\"uptime_url\" AND metric.label.check_id=\"${UPTIME_WEB_ID##*/}\"",
        "comparison": "COMPARISON_LT",
        "thresholdValue": 1,
        "duration": "60s",
        "trigger": {
          "count": 1
        },
        "aggregations": [
          {
            "alignmentPeriod": "120s",
            "perSeriesAligner": "ALIGN_NEXT_OLDER"
          }
        ]
      }
    }
  ],
  "combiner": "OR",
  "enabled": true,
  "notificationChannels": [
    "${CHANNEL_ID}"
  ]
}
JSON

cat > "${EVIDENCE_DIR}/alert_api_uptime.json" <<JSON
{
  "displayName": "WC88 API Uptime Failure ${STAMP}",
  "documentation": {
    "content": "WorkCaptain API health endpoint is failing.",
    "mimeType": "text/markdown"
  },
  "conditions": [
    {
      "displayName": "API uptime unhealthy",
      "conditionThreshold": {
        "filter": "metric.type=\"monitoring.googleapis.com/uptime_check/check_passed\" AND resource.type=\"uptime_url\" AND metric.label.check_id=\"${UPTIME_API_ID##*/}\"",
        "comparison": "COMPARISON_LT",
        "thresholdValue": 1,
        "duration": "60s",
        "trigger": {
          "count": 1
        },
        "aggregations": [
          {
            "alignmentPeriod": "120s",
            "perSeriesAligner": "ALIGN_NEXT_OLDER"
          }
        ]
      }
    }
  ],
  "combiner": "OR",
  "enabled": true,
  "notificationChannels": [
    "${CHANNEL_ID}"
  ]
}
JSON

runlog alert_web_create gcloud alpha monitoring policies create \
  --project="${PROJECT_ID}" \
  --policy-from-file="${EVIDENCE_DIR}/alert_web_uptime.json"

runlog alert_api_create gcloud alpha monitoring policies create \
  --project="${PROJECT_ID}" \
  --policy-from-file="${EVIDENCE_DIR}/alert_api_uptime.json"

log "Create dashboard"
cat > "${EVIDENCE_DIR}/dashboard.json" <<JSON
{
  "displayName": "${DASHBOARD_NAME}",
  "mosaicLayout": {
    "columns": 12,
    "tiles": [
      {
        "xPos": 0,
        "yPos": 0,
        "width": 6,
        "height": 4,
        "widget": {
          "title": "API Request Count",
          "xyChart": {
            "dataSets": [
              {
                "timeSeriesQuery": {
                  "timeSeriesFilter": {
                    "filter": "metric.type=\"run.googleapis.com/request_count\" resource.type=\"cloud_run_revision\" resource.label.service_name=\"${API_SERVICE}\"",
                    "aggregation": {
                      "alignmentPeriod": "60s",
                      "perSeriesAligner": "ALIGN_RATE"
                    }
                  }
                },
                "plotType": "LINE"
              }
            ]
          }
        }
      },
      {
        "xPos": 6,
        "yPos": 0,
        "width": 6,
        "height": 4,
        "widget": {
          "title": "Web Request Count",
          "xyChart": {
            "dataSets": [
              {
                "timeSeriesQuery": {
                  "timeSeriesFilter": {
                    "filter": "metric.type=\"run.googleapis.com/request_count\" resource.type=\"cloud_run_revision\" resource.label.service_name=\"${WEB_SERVICE}\"",
                    "aggregation": {
                      "alignmentPeriod": "60s",
                      "perSeriesAligner": "ALIGN_RATE"
                    }
                  }
                },
                "plotType": "LINE"
              }
            ]
          }
        }
      },
      {
        "xPos": 0,
        "yPos": 4,
        "width": 6,
        "height": 4,
        "widget": {
          "title": "API Latency p95",
          "xyChart": {
            "dataSets": [
              {
                "timeSeriesQuery": {
                  "timeSeriesFilter": {
                    "filter": "metric.type=\"run.googleapis.com/request_latencies\" resource.type=\"cloud_run_revision\" resource.label.service_name=\"${API_SERVICE}\"",
                    "aggregation": {
                      "alignmentPeriod": "60s",
                      "perSeriesAligner": "ALIGN_DELTA"
                    }
                  }
                },
                "plotType": "LINE"
              }
            ]
          }
        }
      },
      {
        "xPos": 6,
        "yPos": 4,
        "width": 6,
        "height": 4,
        "widget": {
          "title": "Web Latency p95",
          "xyChart": {
            "dataSets": [
              {
                "timeSeriesQuery": {
                  "timeSeriesFilter": {
                    "filter": "metric.type=\"run.googleapis.com/request_latencies\" resource.type=\"cloud_run_revision\" resource.label.service_name=\"${WEB_SERVICE}\"",
                    "aggregation": {
                      "alignmentPeriod": "60s",
                      "perSeriesAligner": "ALIGN_DELTA"
                    }
                  }
                },
                "plotType": "LINE"
              }
            ]
          }
        }
      }
    ]
  }
}
JSON

runlog dashboard_create gcloud monitoring dashboards create \
  --project="${PROJECT_ID}" \
  --config-from-file="${EVIDENCE_DIR}/dashboard.json"

log "Capture uptime, policies, dashboard inventory"
runlog uptime_list gcloud monitoring uptime list-configs --project="${PROJECT_ID}"
runlog policies_list gcloud alpha monitoring policies list --project="${PROJECT_ID}"
runlog dashboards_list gcloud monitoring dashboards list --project="${PROJECT_ID}"

log "Capture log review baselines"
runlog api_logs_recent gcloud logging read \
  'resource.type="cloud_run_revision" AND resource.labels.service_name="api-service"' \
  --project="${PROJECT_ID}" \
  --limit=20 \
  --freshness=1h \
  --format=json

runlog web_logs_recent gcloud logging read \
  'resource.type="cloud_run_revision" AND resource.labels.service_name="web-service"' \
  --project="${PROJECT_ID}" \
  --limit=20 \
  --freshness=1h \
  --format=json

runlog api_logs_errors gcloud logging read \
  'resource.type="cloud_run_revision" AND resource.labels.service_name="api-service" AND severity>=ERROR' \
  --project="${PROJECT_ID}" \
  --limit=20 \
  --freshness=24h \
  --format=json

runlog web_logs_errors gcloud logging read \
  'resource.type="cloud_run_revision" AND resource.labels.service_name="web-service" AND severity>=ERROR' \
  --project="${PROJECT_ID}" \
  --limit=20 \
  --freshness=24h \
  --format=json

log "Write summary and manifest"
cat > "${EVIDENCE_DIR}/PHASE_88_SUMMARY.md" <<SUMMARY
# PHASE 88 — POST-LAUNCH OPERATIONS + OBSERVABILITY + TRAFFIC ACTIVATION

STATUS: PASS

PROJECT_ID=${PROJECT_ID}
REGION=${REGION}
WEB_SERVICE=${WEB_SERVICE}
API_SERVICE=${API_SERVICE}

PUBLIC_WEB=https://${DOMAIN_ROOT}
PUBLIC_WWW=https://${DOMAIN_WWW}
PUBLIC_API=https://${DOMAIN_API}

BASELINE_VALIDATION:
- https://${DOMAIN_ROOT} -> ${WEB_CODE}
- https://${DOMAIN_WWW} -> ${WWW_CODE}
- https://${DOMAIN_ROOT}/health -> ${WEB_HEALTH_CODE}
- https://${DOMAIN_API}/health -> ${API_HEALTH_CODE}
- https://${DOMAIN_API}/docs -> ${DOCS_CODE}

OBSERVABILITY_OBJECTS:
- Notification channel: ${CHANNEL_ID}
- Uptime web: ${UPTIME_WEB_ID}
- Uptime api: ${UPTIME_API_ID}

OPERATING_MODE:
- Post-launch observability established
- Traffic activation runbook documented
- First-user onboarding readiness documented
SUMMARY

cat > "${EVIDENCE_DIR}/MANIFEST.json" <<MANIFEST
{
  "phase": "PHASE_88",
  "status": "PASS",
  "timestamp": "${STAMP}",
  "project_id": "${PROJECT_ID}",
  "region": "${REGION}",
  "web_service": "${WEB_SERVICE}",
  "api_service": "${API_SERVICE}",
  "public_web": "https://${DOMAIN_ROOT}",
  "public_www": "https://${DOMAIN_WWW}",
  "public_api": "https://${DOMAIN_API}",
  "notification_channel": "${CHANNEL_ID}",
  "uptime_web_id": "${UPTIME_WEB_ID}",
  "uptime_api_id": "${UPTIME_API_ID}"
}
MANIFEST

log "Git status before commit"
runlog git_status_before git -C "${ROOT}" status --short

log "Commit and push source of truth"
git -C "${ROOT}" add \
  "operations/phase88_observability/PHASE_88_SCOPE.md" \
  "operations/phase88_observability/UPTIME_MONITORING_SPEC.md" \
  "operations/phase88_observability/ALERTING_BASELINE.md" \
  "operations/phase88_observability/TRAFFIC_ACTIVATION_RUNBOOK.md" \
  "operations/phase88_observability/FIRST_USER_ONBOARDING_READINESS.md" \
  "operations/phase88_observability/OPERATIONS_DASHBOARD_BASELINE.md" \
  "operations/phase88_observability/LOG_REVIEW_PROTOCOL.md" \
  "scripts/workcaptain_phase88_post_launch_ops.sh"

git -C "${ROOT}" add -f "${EVIDENCE_DIR}"

git -C "${ROOT}" commit -m "PHASE_88_PASS — post-launch operations + observability + traffic activation baseline"
git -C "${ROOT}" push origin "${BRANCH_NAME}"

NEW_SOURCE_OF_TRUTH_COMMIT="$(git -C "${ROOT}" rev-parse HEAD)"
echo "NEW_SOURCE_OF_TRUTH_COMMIT=${NEW_SOURCE_OF_TRUTH_COMMIT}" | tee "${EVIDENCE_DIR}/SOURCE_OF_TRUTH.txt"
echo "EVIDENCE_RUN_DIR=${EVIDENCE_DIR}" | tee -a "${EVIDENCE_DIR}/SOURCE_OF_TRUTH.txt"

printf '\nPHASE_88_PASS\n'
printf 'NEW_SOURCE_OF_TRUTH_COMMIT=%s\n' "${NEW_SOURCE_OF_TRUTH_COMMIT}"
printf 'EVIDENCE_RUN_DIR=%s\n' "${EVIDENCE_DIR}"
printf 'PUBLIC_WEB=https://%s\n' "${DOMAIN_ROOT}"
printf 'PUBLIC_WWW=https://%s\n' "${DOMAIN_WWW}"
printf 'PUBLIC_API=https://%s\n' "${DOMAIN_API}"
