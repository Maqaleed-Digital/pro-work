#!/usr/bin/env bash
set -euo pipefail

ROOT="${ROOT:?}"
PROJECT_ID="${PROJECT_ID:?}"
REGION="${REGION:?}"
API_SERVICE="${API_SERVICE:?}"
WEB_SERVICE="${WEB_SERVICE:?}"
DNS_ZONE_NAME="${DNS_ZONE_NAME:?}"
DOMAIN_ROOT="${DOMAIN_ROOT:?}"
DOMAIN_WWW="${DOMAIN_WWW:?}"
DOMAIN_API="${DOMAIN_API:?}"
AR_REPO="${AR_REPO:?}"
STAMP="${STAMP:?}"
EVIDENCE_DIR="${EVIDENCE_DIR:?}"
BRANCH_NAME="${BRANCH_NAME:?}"
IMAGE_URI="${IMAGE_URI:?}"

log() { printf '%s %s\n' "[$(date -u +%H:%M:%SZ)]" "$*"; }

mkdir -p "${EVIDENCE_DIR}"

runlog() {
  local name="$1"
  shift
  {
    echo "\$ $*"
    "$@"
  } 2>&1 | tee "${EVIDENCE_DIR}/${name}.log"
}

# ─── LB RESOURCE NAMES ────────────────────────────────────────────────────────
LB_IP_NAME="workcaptain-lb-ip"
URLMAP_NAME="workcaptain-urlmap"
CERT_NAME="workcaptain-cert"
HTTPS_PROXY_NAME="workcaptain-https-proxy"
HTTPS_FR_NAME="workcaptain-https-fr"
BS_API="bs-${API_SERVICE}"
BS_WEB="bs-${WEB_SERVICE}"
NEG_API="neg-${API_SERVICE}"
NEG_WEB="neg-${WEB_SERVICE}"

log "PHASE 87 START"
runlog project_context gcloud config set project "${PROJECT_ID}"
runlog active_project gcloud config get-value project

log "Enable required APIs"
runlog services_enable gcloud services enable \
  run.googleapis.com \
  dns.googleapis.com \
  artifactregistry.googleapis.com \
  cloudbuild.googleapis.com \
  compute.googleapis.com

log "Ensure Artifact Registry repository exists"
if ! gcloud artifacts repositories describe "${AR_REPO}" \
  --location="${REGION}" \
  --project="${PROJECT_ID}" >/dev/null 2>&1; then
  runlog ar_repo_create gcloud artifacts repositories create "${AR_REPO}" \
    --repository-format=docker \
    --location="${REGION}" \
    --description="WorkCaptain application images"
fi

log "Capture API baseline"
runlog api_describe_before gcloud run services describe "${API_SERVICE}" \
  --region="${REGION}" \
  --project="${PROJECT_ID}" \
  --format="yaml(metadata.name,status.url,status.conditions)"

API_RUN_URL="$(gcloud run services describe "${API_SERVICE}" \
  --region="${REGION}" \
  --project="${PROJECT_ID}" \
  --format="value(status.url)")"
if [ -z "${API_RUN_URL}" ]; then
  echo "FAIL_CLOSED: could not resolve API service URL" >&2
  exit 1
fi
log "API_RUN_URL=${API_RUN_URL}"

log "Fail-closed frontend audit"
if [ ! -f "${ROOT}/app/frontend/package.json" ]; then
  echo "FAIL_CLOSED: missing ${ROOT}/app/frontend/package.json" >&2
  exit 1
fi
if ! grep -R "VITE_BACKEND_URL" "${ROOT}/app/frontend" >/dev/null 2>&1; then
  echo "FAIL_CLOSED: app/frontend does not reference VITE_BACKEND_URL" >&2
  exit 1
fi

log "Build and push web-service image"
runlog web_build gcloud builds submit "${ROOT}/app/frontend" \
  --project="${PROJECT_ID}" \
  --region="${REGION}" \
  --config "${ROOT}/app/frontend/cloudbuild.yaml" \
  --substitutions "_IMAGE_URI=${IMAGE_URI}" \
  --gcs-source-staging-dir "gs://bkt-prj-maq-workcaptain-nonprod-cb-me/source" \
  --gcs-log-dir "gs://bkt-prj-maq-workcaptain-nonprod-cb-me/logs"

log "Deploy web-service to Cloud Run temporary URL with direct API origin"
runlog web_deploy_temp gcloud run deploy "${WEB_SERVICE}" \
  --image "${IMAGE_URI}" \
  --region "${REGION}" \
  --project "${PROJECT_ID}" \
  --allow-unauthenticated \
  --port 8080 \
  --set-env-vars "API_ORIGIN=${API_RUN_URL}"

WEB_RUN_URL="$(gcloud run services describe "${WEB_SERVICE}" \
  --region "${REGION}" \
  --project "${PROJECT_ID}" \
  --format="value(status.url)")"
if [ -z "${WEB_RUN_URL}" ]; then
  echo "FAIL_CLOSED: could not resolve WEB service URL" >&2
  exit 1
fi
log "WEB_RUN_URL=${WEB_RUN_URL}"

log "Validate temporary HTTPS on Cloud Run URL"
runlog web_temp_headers curl -sSI "${WEB_RUN_URL}"
WEB_TEMP_CODE="$(curl -s -o /dev/null -w "%{http_code}" "${WEB_RUN_URL}")"
WEB_TEMP_HEALTH_CODE="$(curl -s -o /dev/null -w "%{http_code}" "${WEB_RUN_URL}/health")"
API_PROXY_CODE="$(curl -s -o /dev/null -w "%{http_code}" "${WEB_RUN_URL}/docs")"
echo "WEB_TEMP_CODE=${WEB_TEMP_CODE}" | tee "${EVIDENCE_DIR}/web_temp_status.txt"
echo "WEB_TEMP_HEALTH_CODE=${WEB_TEMP_HEALTH_CODE}" | tee -a "${EVIDENCE_DIR}/web_temp_status.txt"
echo "API_PROXY_CODE=${API_PROXY_CODE}" | tee -a "${EVIDENCE_DIR}/web_temp_status.txt"
if [ "${WEB_TEMP_CODE}" != "200" ] || [ "${WEB_TEMP_HEALTH_CODE}" != "200" ]; then
  echo "FAIL_CLOSED: web-service temporary URL failed validation" >&2
  exit 1
fi

# ─── GLOBAL HTTPS LOAD BALANCER + SERVERLESS NEGs ─────────────────────────────
# Cloud Run domain-mappings are not supported in me-central2.
# Route: DNS A -> LB global IP -> HTTPS proxy -> URL map -> serverless NEG -> Cloud Run

log "Reserve global static IP for load balancer"
if ! gcloud compute addresses describe "${LB_IP_NAME}" \
  --global --project="${PROJECT_ID}" >/dev/null 2>&1; then
  runlog lb_ip_create gcloud compute addresses create "${LB_IP_NAME}" \
    --global \
    --project="${PROJECT_ID}"
fi
LB_IP="$(gcloud compute addresses describe "${LB_IP_NAME}" \
  --global --project="${PROJECT_ID}" --format="value(address)")"
if [ -z "${LB_IP}" ]; then
  echo "FAIL_CLOSED: could not resolve LB IP" >&2
  exit 1
fi
log "LB_IP=${LB_IP}"
echo "LB_IP=${LB_IP}" | tee "${EVIDENCE_DIR}/lb_ip.txt"

log "Create serverless NEG for ${API_SERVICE} in ${REGION}"
if ! gcloud compute network-endpoint-groups describe "${NEG_API}" \
  --region="${REGION}" --project="${PROJECT_ID}" >/dev/null 2>&1; then
  runlog neg_api_create gcloud compute network-endpoint-groups create "${NEG_API}" \
    --region="${REGION}" \
    --network-endpoint-type=serverless \
    --cloud-run-service="${API_SERVICE}" \
    --project="${PROJECT_ID}"
fi

log "Create serverless NEG for ${WEB_SERVICE} in ${REGION}"
if ! gcloud compute network-endpoint-groups describe "${NEG_WEB}" \
  --region="${REGION}" --project="${PROJECT_ID}" >/dev/null 2>&1; then
  runlog neg_web_create gcloud compute network-endpoint-groups create "${NEG_WEB}" \
    --region="${REGION}" \
    --network-endpoint-type=serverless \
    --cloud-run-service="${WEB_SERVICE}" \
    --project="${PROJECT_ID}"
fi

log "Create backend service for ${API_SERVICE}"
if ! gcloud compute backend-services describe "${BS_API}" \
  --global --project="${PROJECT_ID}" >/dev/null 2>&1; then
  runlog bs_api_create gcloud compute backend-services create "${BS_API}" \
    --global \
    --project="${PROJECT_ID}"
  runlog bs_api_add_neg gcloud compute backend-services add-backend "${BS_API}" \
    --global \
    --network-endpoint-group="${NEG_API}" \
    --network-endpoint-group-region="${REGION}" \
    --project="${PROJECT_ID}"
fi

log "Create backend service for ${WEB_SERVICE}"
if ! gcloud compute backend-services describe "${BS_WEB}" \
  --global --project="${PROJECT_ID}" >/dev/null 2>&1; then
  runlog bs_web_create gcloud compute backend-services create "${BS_WEB}" \
    --global \
    --project="${PROJECT_ID}"
  runlog bs_web_add_neg gcloud compute backend-services add-backend "${BS_WEB}" \
    --global \
    --network-endpoint-group="${NEG_WEB}" \
    --network-endpoint-group-region="${REGION}" \
    --project="${PROJECT_ID}"
fi

log "Create URL map: default=web-service; ${DOMAIN_API} -> api-service"
if ! gcloud compute url-maps describe "${URLMAP_NAME}" \
  --global --project="${PROJECT_ID}" >/dev/null 2>&1; then
  runlog urlmap_create gcloud compute url-maps create "${URLMAP_NAME}" \
    --default-service="${BS_WEB}" \
    --global \
    --project="${PROJECT_ID}"
  runlog urlmap_api_path_matcher gcloud compute url-maps add-path-matcher "${URLMAP_NAME}" \
    --path-matcher-name="api-matcher" \
    --default-service="${BS_API}" \
    --global \
    --project="${PROJECT_ID}"
  runlog urlmap_api_host_rule gcloud compute url-maps add-host-rule "${URLMAP_NAME}" \
    --hosts="${DOMAIN_API}" \
    --path-matcher-name="api-matcher" \
    --global \
    --project="${PROJECT_ID}"
fi

log "Create Google-managed SSL certificate for all 3 domains"
if ! gcloud compute ssl-certificates describe "${CERT_NAME}" \
  --global --project="${PROJECT_ID}" >/dev/null 2>&1; then
  runlog cert_create gcloud compute ssl-certificates create "${CERT_NAME}" \
    --domains="${DOMAIN_ROOT},${DOMAIN_WWW},${DOMAIN_API}" \
    --global \
    --project="${PROJECT_ID}"
fi

log "Create HTTPS target proxy"
if ! gcloud compute target-https-proxies describe "${HTTPS_PROXY_NAME}" \
  --global --project="${PROJECT_ID}" >/dev/null 2>&1; then
  runlog https_proxy_create gcloud compute target-https-proxies create "${HTTPS_PROXY_NAME}" \
    --url-map="${URLMAP_NAME}" \
    --ssl-certificates="${CERT_NAME}" \
    --global \
    --project="${PROJECT_ID}"
fi

log "Create HTTPS forwarding rule (port 443) bound to ${LB_IP_NAME}"
if ! gcloud compute forwarding-rules describe "${HTTPS_FR_NAME}" \
  --global --project="${PROJECT_ID}" >/dev/null 2>&1; then
  runlog https_fr_create gcloud compute forwarding-rules create "${HTTPS_FR_NAME}" \
    --global \
    --target-https-proxy="${HTTPS_PROXY_NAME}" \
    --address="${LB_IP_NAME}" \
    --ports=443 \
    --project="${PROJECT_ID}"
fi

log "Export LB resource state to evidence"
gcloud compute url-maps describe "${URLMAP_NAME}" \
  --global --project="${PROJECT_ID}" --format=json > "${EVIDENCE_DIR}/urlmap.json"
gcloud compute ssl-certificates describe "${CERT_NAME}" \
  --global --project="${PROJECT_ID}" --format=json > "${EVIDENCE_DIR}/ssl_cert.json"
gcloud compute forwarding-rules describe "${HTTPS_FR_NAME}" \
  --global --project="${PROJECT_ID}" --format=json > "${EVIDENCE_DIR}/https_fr.json"

log "Pre-DNS LB sanity check via IP + host-header (-k: cert not yet provisioned)"
for domain in "${DOMAIN_ROOT}" "${DOMAIN_WWW}" "${DOMAIN_API}"; do
  CODE="$(curl -k -s -o /dev/null -w "%{http_code}" \
    --resolve "${domain}:443:${LB_IP}" \
    "https://${domain}/" || true)"
  echo "PRE_DNS domain=${domain} code=${CODE}" | tee -a "${EVIDENCE_DIR}/lb_predns_check.log"
done

log "Cut DNS — A records for all 3 domains -> LB IP ${LB_IP}"
EVIDENCE_DIR="${EVIDENCE_DIR}" DNS_ZONE_NAME="${DNS_ZONE_NAME}" LB_IP="${LB_IP}" \
DOMAIN_ROOT="${DOMAIN_ROOT}" DOMAIN_WWW="${DOMAIN_WWW}" DOMAIN_API="${DOMAIN_API}" python3 - <<'PY'
import json, os, subprocess, sys

zone = os.environ["DNS_ZONE_NAME"]
lb_ip = os.environ["LB_IP"]
domains = [
    os.environ["DOMAIN_ROOT"] + ".",
    os.environ["DOMAIN_WWW"] + ".",
    os.environ["DOMAIN_API"] + ".",
]

# Abort any stuck transaction before starting
subprocess.run(
    ["gcloud", "dns", "record-sets", "transaction", "abort", "--zone", zone],
    capture_output=True
)
subprocess.run(
    ["gcloud", "dns", "record-sets", "transaction", "start", "--zone", zone],
    check=True
)

for fqdn in domains:
    # Remove both A and CNAME records — CNAME and A cannot coexist
    for rtype in ("A", "CNAME"):
        existing = subprocess.run(
            ["gcloud", "dns", "record-sets", "list", "--zone", zone,
             "--name", fqdn, "--type", rtype, "--format=json"],
            capture_output=True, text=True, check=True
        )
        rows = json.loads(existing.stdout or "[]")
        for row in rows:
            ttl = str(row["ttl"])
            vals = row["rrdatas"]
            subprocess.run(
                ["gcloud", "dns", "record-sets", "transaction", "remove",
                 "--zone", zone, "--name", fqdn, "--type", rtype, "--ttl", ttl, *vals],
                check=False
            )
    subprocess.run(
        ["gcloud", "dns", "record-sets", "transaction", "add",
         "--zone", zone, "--name", fqdn, "--type", "A", "--ttl", "300", lb_ip],
        check=True
    )

subprocess.run(
    ["gcloud", "dns", "record-sets", "transaction", "execute", "--zone", zone],
    check=True
)
print(f"DNS A records committed: {domains} -> {lb_ip}")
PY

log "Re-deploy web-service with final API origin (https://${DOMAIN_API})"
runlog web_deploy_final_api gcloud run deploy "${WEB_SERVICE}" \
  --image "${IMAGE_URI}" \
  --region "${REGION}" \
  --project "${PROJECT_ID}" \
  --allow-unauthenticated \
  --port 8080 \
  --set-env-vars "API_ORIGIN=https://${DOMAIN_API}"

log "Poll live domains (managed cert provisioning: up to 60 min; polling 120 x 30s = 60 min max)"
for i in $(seq 1 120); do
  ROOT_CODE="$(curl -k -s -o /dev/null -w "%{http_code}" "https://${DOMAIN_ROOT}" || true)"
  WWW_CODE="$(curl -k -s -o /dev/null -w "%{http_code}" "https://${DOMAIN_WWW}" || true)"
  API_CODE="$(curl -k -s -o /dev/null -w "%{http_code}" "https://${DOMAIN_API}/health" || true)"
  WEB_HEALTH_CODE="$(curl -k -s -o /dev/null -w "%{http_code}" "https://${DOMAIN_ROOT}/health" || true)"
  DOCS_CODE="$(curl -k -s -o /dev/null -w "%{http_code}" "https://${DOMAIN_API}/docs" || true)"
  CERT_STATUS="$(gcloud compute ssl-certificates describe "${CERT_NAME}" \
    --global --project="${PROJECT_ID}" --format="value(managed.status)" 2>/dev/null || true)"
  echo "ITER=${i} ROOT=${ROOT_CODE} WWW=${WWW_CODE} API_HEALTH=${API_CODE} WEB_HEALTH=${WEB_HEALTH_CODE} DOCS=${DOCS_CODE} CERT=${CERT_STATUS}" \
    | tee -a "${EVIDENCE_DIR}/live_domain_poll.log"
  if [ "${ROOT_CODE}" = "200" ] && [ "${WWW_CODE}" = "200" ] && \
     [ "${API_CODE}" = "200" ] && [ "${WEB_HEALTH_CODE}" = "200" ] && \
     [ "${DOCS_CODE}" = "200" ]; then
    break
  fi
  sleep 30
done

ROOT_CODE="$(curl -k -s -o /dev/null -w "%{http_code}" "https://${DOMAIN_ROOT}" || true)"
WWW_CODE="$(curl -k -s -o /dev/null -w "%{http_code}" "https://${DOMAIN_WWW}" || true)"
API_CODE="$(curl -k -s -o /dev/null -w "%{http_code}" "https://${DOMAIN_API}/health" || true)"
WEB_HEALTH_CODE="$(curl -k -s -o /dev/null -w "%{http_code}" "https://${DOMAIN_ROOT}/health" || true)"
DOCS_CODE="$(curl -k -s -o /dev/null -w "%{http_code}" "https://${DOMAIN_API}/docs" || true)"

if [ "${ROOT_CODE}" != "200" ] || [ "${WWW_CODE}" != "200" ] || \
   [ "${API_CODE}" != "200" ] || [ "${WEB_HEALTH_CODE}" != "200" ] || \
   [ "${DOCS_CODE}" != "200" ]; then
  echo "FAIL_CLOSED: final domain validation failed" >&2
  echo "ROOT=${ROOT_CODE} WWW=${WWW_CODE} API_HEALTH=${API_CODE} WEB_HEALTH=${WEB_HEALTH_CODE} DOCS=${DOCS_CODE}" >&2
  exit 1
fi

log "Capture final headers"
runlog root_headers curl -sSI "https://${DOMAIN_ROOT}"
runlog www_headers curl -sSI "https://${DOMAIN_WWW}"
runlog api_health_headers curl -sSI "https://${DOMAIN_API}/health"
runlog api_docs_headers curl -sSI "https://${DOMAIN_API}/docs"

log "Write evidence summary"
cat > "${EVIDENCE_DIR}/PHASE_87_SUMMARY.md" <<SUMMARY
# PHASE 87 — WEB UI FOUNDATION + DOMAIN SPLIT + GLOBAL HTTPS LB CUTOVER

STATUS: PASS
DOMAIN_STRATEGY: GLOBAL_HTTPS_LOAD_BALANCER + SERVERLESS_NEG

SOURCE_UI=app/frontend
WEB_SERVICE=${WEB_SERVICE}
API_SERVICE=${API_SERVICE}

LB_IP=${LB_IP}
LB_CERT=${CERT_NAME}
LB_URLMAP=${URLMAP_NAME}

PUBLIC_WEB=https://${DOMAIN_ROOT}
PUBLIC_WWW=https://${DOMAIN_WWW}
PUBLIC_API=https://${DOMAIN_API}

VALIDATION:
- https://${DOMAIN_ROOT} -> ${ROOT_CODE}
- https://${DOMAIN_WWW} -> ${WWW_CODE}
- https://${DOMAIN_ROOT}/health -> ${WEB_HEALTH_CODE}
- https://${DOMAIN_API}/health -> ${API_CODE}
- https://${DOMAIN_API}/docs -> ${DOCS_CODE}

RUNTIME:
- Temporary web validation passed on ${WEB_RUN_URL}
- LB IP reserved: ${LB_IP}
- DNS A records cut to LB IP for all 3 domains
- Final API origin wired to https://${DOMAIN_API}
- Apex/www routed via LB -> ${WEB_SERVICE}
- API subdomain routed via LB -> ${API_SERVICE}
SUMMARY

cat > "${EVIDENCE_DIR}/MANIFEST.json" <<MANIFEST
{
  "phase": "PHASE_87",
  "status": "PASS",
  "timestamp": "${STAMP}",
  "project_id": "${PROJECT_ID}",
  "domain_strategy": "GLOBAL_HTTPS_LOAD_BALANCER_SERVERLESS_NEG",
  "ui_source": "app/frontend",
  "web_service": "${WEB_SERVICE}",
  "api_service": "${API_SERVICE}",
  "lb_ip": "${LB_IP}",
  "lb_ip_name": "${LB_IP_NAME}",
  "lb_cert": "${CERT_NAME}",
  "lb_urlmap": "${URLMAP_NAME}",
  "public_web": "https://${DOMAIN_ROOT}",
  "public_www": "https://${DOMAIN_WWW}",
  "public_api": "https://${DOMAIN_API}"
}
MANIFEST

log "Git status before commit"
runlog git_status_before git -C "${ROOT}" status --short

log "Commit and push source of truth"
git -C "${ROOT}" add \
  "app/frontend/Dockerfile.web" \
  "app/frontend/cloudbuild.yaml" \
  "app/frontend/nginx.conf.template" \
  "app/frontend/.env.production" \
  "scripts/workcaptain_phase87_ui_cutover.sh"
git -C "${ROOT}" add -f "${EVIDENCE_DIR}"

git -C "${ROOT}" commit -m "PHASE_87_PASS — web-service deployed + LB cutover + all 3 domains live"
git -C "${ROOT}" push origin "${BRANCH_NAME}"

NEW_SOURCE_OF_TRUTH_COMMIT="$(git -C "${ROOT}" rev-parse HEAD)"
echo "NEW_SOURCE_OF_TRUTH_COMMIT=${NEW_SOURCE_OF_TRUTH_COMMIT}" | tee "${EVIDENCE_DIR}/SOURCE_OF_TRUTH.txt"
echo "EVIDENCE_RUN_DIR=${EVIDENCE_DIR}" | tee -a "${EVIDENCE_DIR}/SOURCE_OF_TRUTH.txt"

printf '\nPHASE_87_PASS\n'
printf 'NEW_SOURCE_OF_TRUTH_COMMIT=%s\n' "${NEW_SOURCE_OF_TRUTH_COMMIT}"
printf 'EVIDENCE_RUN_DIR=%s\n' "${EVIDENCE_DIR}"
printf 'LB_IP=%s\n' "${LB_IP}"
printf 'PUBLIC_WEB=https://%s\n' "${DOMAIN_ROOT}"
printf 'PUBLIC_WWW=https://%s\n' "${DOMAIN_WWW}"
printf 'PUBLIC_API=https://%s\n' "${DOMAIN_API}"
