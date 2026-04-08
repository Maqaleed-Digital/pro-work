#!/usr/bin/env bash
set -euo pipefail

fail() {
  echo "ERROR: $*" >&2
  exit 1
}

require_cmd() {
  command -v "$1" >/dev/null 2>&1 || fail "Missing required command: $1"
}

require_env() {
  local name="$1"
  [[ -n "${!name:-}" ]] || fail "Required environment variable not set: $name"
}

require_cmd gcloud
require_cmd curl
require_cmd mkdir
require_cmd tee
require_cmd date

require_env WC_GCP_PROJECT_ID
require_env WC_GCP_REGION
require_env WC_GCP_ENV

TIMESTAMP="$(date -u +"%Y%m%dT%H%M%SZ")"
EVIDENCE_RUN_DIR="FND/EVIDENCE/WORKCAPTAIN-PHASE-8-RELIABILITY-AND-OBSERVABILITY-HARDENING/${TIMESTAMP}"
mkdir -p "${EVIDENCE_RUN_DIR}"

log() {
  echo "[$(date -u +"%Y-%m-%dT%H:%M:%SZ")] $*" | tee -a "${EVIDENCE_RUN_DIR}/decision_log.txt"
}

UPTIME_CHECK_NAME="workcaptain-api-health-uptime"
ALERT_UPTIME_NAME="workcaptain-api-health-uptime-alert"
ALERT_BACKEND_NAME="workcaptain-cloudrun-backend-alert"

log "START Phase 8 reliability and observability hardening"
log "Project=${WC_GCP_PROJECT_ID} Region=${WC_GCP_REGION} Env=${WC_GCP_ENV}"

curl -i --max-time 30 "https://api.workcaptain.ai/health" > "${EVIDENCE_RUN_DIR}/public_health_precheck.log" 2>&1 || fail "Public health endpoint precheck failed"

gcloud run services describe "api-service" \
  --project="${WC_GCP_PROJECT_ID}" \
  --region="${WC_GCP_REGION}" \
  --format=json > "${EVIDENCE_RUN_DIR}/api-service.json"

gcloud run services describe "trust-processor" \
  --project="${WC_GCP_PROJECT_ID}" \
  --region="${WC_GCP_REGION}" \
  --format=json > "${EVIDENCE_RUN_DIR}/trust-processor.json"

gcloud run services describe "agent-orchestrator" \
  --project="${WC_GCP_PROJECT_ID}" \
  --region="${WC_GCP_REGION}" \
  --format=json > "${EVIDENCE_RUN_DIR}/agent-orchestrator.json"

gcloud run services describe "background-worker" \
  --project="${WC_GCP_PROJECT_ID}" \
  --region="${WC_GCP_REGION}" \
  --format=json > "${EVIDENCE_RUN_DIR}/background-worker.json"

if ! gcloud monitoring uptime-checks describe "${UPTIME_CHECK_NAME}" --project="${WC_GCP_PROJECT_ID}" >/dev/null 2>&1; then
  gcloud monitoring uptime-checks create "${UPTIME_CHECK_NAME}" \
    --project="${WC_GCP_PROJECT_ID}" \
    --resource-type="uptime-url" \
    --hostname="api.workcaptain.ai" \
    --path="/health" \
    --port=443 \
    --use-ssl \
    --period=60 \
    --timeout=10 > "${EVIDENCE_RUN_DIR}/uptime_check_create.log" 2>&1
else
  gcloud monitoring uptime-checks describe "${UPTIME_CHECK_NAME}" \
    --project="${WC_GCP_PROJECT_ID}" > "${EVIDENCE_RUN_DIR}/uptime_check_existing.log" 2>&1
fi

UPTIME_CHECK_ID="$(gcloud monitoring uptime-checks list --project="${WC_GCP_PROJECT_ID}" --format="value(name)" | grep "${UPTIME_CHECK_NAME}" || true)"
[[ -n "${UPTIME_CHECK_ID}" ]] || fail "Unable to locate uptime check ID for ${UPTIME_CHECK_NAME}"
echo "${UPTIME_CHECK_ID}" > "${EVIDENCE_RUN_DIR}/uptime_check_id.txt"

cat > "${EVIDENCE_RUN_DIR}/uptime_alert_policy.json" <<EOFJSON
{
  "displayName": "${ALERT_UPTIME_NAME}",
  "combiner": "OR",
  "conditions": [
    {
      "displayName": "Uptime check failure for api.workcaptain.ai/health",
      "conditionThreshold": {
        "filter": "metric.type=\\"monitoring.googleapis.com/uptime_check/check_passed\\" AND resource.type=\\"uptime_url\\" AND metric.label.\\"check_id\\"=\\"${UPTIME_CHECK_ID##*/}\\"",
        "comparison": "COMPARISON_LT",
        "thresholdValue": 1,
        "duration": "60s",
        "aggregations": [
          {
            "alignmentPeriod": "60s",
            "perSeriesAligner": "ALIGN_NEXT_OLDER"
          }
        ],
        "trigger": {
          "count": 1
        }
      }
    }
  ],
  "enabled": true
}
EOFJSON

cat > "${EVIDENCE_RUN_DIR}/backend_alert_policy.json" <<'EOFJSON'
{
  "displayName": "workcaptain-cloudrun-backend-alert",
  "combiner": "OR",
  "conditions": [
    {
      "displayName": "Cloud Run request error count baseline",
      "conditionThreshold": {
        "filter": "resource.type=\"cloud_run_revision\" AND metric.type=\"run.googleapis.com/request_count\" AND metric.label.\"response_code_class\"=\"5xx\"",
        "comparison": "COMPARISON_GT",
        "thresholdValue": 0,
        "duration": "300s",
        "aggregations": [
          {
            "alignmentPeriod": "300s",
            "perSeriesAligner": "ALIGN_RATE"
          }
        ],
        "trigger": {
          "count": 1
        }
      }
    }
  ],
  "enabled": true
}
EOFJSON

EXISTING_UPTIME_ALERT="$(gcloud monitoring policies list --project="${WC_GCP_PROJECT_ID}" --format="value(displayName)" | grep "^${ALERT_UPTIME_NAME}$" || true)"
if [[ -z "${EXISTING_UPTIME_ALERT}" ]]; then
  gcloud monitoring policies create \
    --project="${WC_GCP_PROJECT_ID}" \
    --policy-from-file="${EVIDENCE_RUN_DIR}/uptime_alert_policy.json" > "${EVIDENCE_RUN_DIR}/uptime_alert_create.log" 2>&1
else
  echo "${EXISTING_UPTIME_ALERT}" > "${EVIDENCE_RUN_DIR}/uptime_alert_existing.txt"
fi

EXISTING_BACKEND_ALERT="$(gcloud monitoring policies list --project="${WC_GCP_PROJECT_ID}" --format="value(displayName)" | grep "^${ALERT_BACKEND_NAME}$" || true)"
if [[ -z "${EXISTING_BACKEND_ALERT}" ]]; then
  gcloud monitoring policies create \
    --project="${WC_GCP_PROJECT_ID}" \
    --policy-from-file="${EVIDENCE_RUN_DIR}/backend_alert_policy.json" > "${EVIDENCE_RUN_DIR}/backend_alert_create.log" 2>&1
else
  echo "${EXISTING_BACKEND_ALERT}" > "${EVIDENCE_RUN_DIR}/backend_alert_existing.txt"
fi

gcloud monitoring uptime-checks list \
  --project="${WC_GCP_PROJECT_ID}" > "${EVIDENCE_RUN_DIR}/uptime_checks_list.txt"

gcloud monitoring policies list \
  --project="${WC_GCP_PROJECT_ID}" > "${EVIDENCE_RUN_DIR}/alert_policies_list.txt"

cat > "${EVIDENCE_RUN_DIR}/RUNBOOK_NOTE.txt" <<'EOFNOTE'
Public monitored endpoint:
- https://api.workcaptain.ai/health

Monitored services:
- api-service
- trust-processor
- agent-orchestrator
- background-worker

Baseline alerting:
- uptime failure alert for public health endpoint
- backend Cloud Run 5xx signal alert baseline

Inspection points:
- gcloud monitoring uptime-checks list
- gcloud monitoring policies list
- gcloud run services describe <service> --region me-central2
EOFNOTE

cat > "${EVIDENCE_RUN_DIR}/MANIFEST.txt" <<EOFMANIFEST
PHASE=WORKCAPTAIN-PHASE-8-RELIABILITY-AND-OBSERVABILITY-HARDENING
TIMESTAMP=${TIMESTAMP}
PROJECT=${WC_GCP_PROJECT_ID}
REGION=${WC_GCP_REGION}
ENV=${WC_GCP_ENV}
EVIDENCE_RUN_DIR=${EVIDENCE_RUN_DIR}
UPTIME_CHECK_NAME=${UPTIME_CHECK_NAME}
ALERT_UPTIME_NAME=${ALERT_UPTIME_NAME}
ALERT_BACKEND_NAME=${ALERT_BACKEND_NAME}
EOFMANIFEST

log "COMPLETE Phase 8 reliability and observability hardening"
echo "EVIDENCE_RUN_DIR=${EVIDENCE_RUN_DIR}"
