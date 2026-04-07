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
require_cmd dig
require_cmd awk
require_cmd sed
require_cmd date
require_cmd mkdir
require_cmd tee

require_env WC_GCP_PROJECT_ID
require_env WC_GCP_REGION
require_env WC_GCP_ENV
require_env WC_DOMAIN
require_env WC_DNS_ZONE
require_env WC_API_SERVICE
require_env WC_ARMOR_POLICY_NAME
require_env WC_LB_NAME
require_env WC_CERT_NAME
require_env WC_BACKEND_SERVICE_NAME
require_env WC_NEG_NAME
require_env WC_URL_MAP_NAME
require_env WC_HTTPS_PROXY_NAME
require_env WC_FORWARDING_RULE_NAME
require_env WC_HEALTH_PATH
require_env WC_FORBIDDEN_PATH

REPO_ROOT="/opt/prowork"
TIMESTAMP="$(date -u +"%Y%m%dT%H%M%SZ")"
EVIDENCE_RUN_DIR="${REPO_ROOT}/FND/EVIDENCE/WORKCAPTAIN-PHASE-5-SEMI-PUBLIC-BETA-LAUNCH/${TIMESTAMP}"
mkdir -p "${EVIDENCE_RUN_DIR}"

log() {
  echo "[$(date -u +"%Y-%m-%dT%H:%M:%SZ")] $*" | tee -a "${EVIDENCE_RUN_DIR}/decision_log.txt"
}

run_capture() {
  local name="$1"
  shift
  log "RUN ${name}: $*"
  "$@" > "${EVIDENCE_RUN_DIR}/${name}.log" 2>&1
}

PUBLIC_IP_NAME="${WC_LB_NAME}-ip"

log "START Phase 5 semi-public beta launch"
log "Project=${WC_GCP_PROJECT_ID} Region=${WC_GCP_REGION} Env=${WC_GCP_ENV} Domain=${WC_DOMAIN}"

run_capture pre_gcloud_config gcloud config list
run_capture pre_project_describe gcloud projects describe "${WC_GCP_PROJECT_ID}"

# ─── GLOBAL IP ───────────────────────────────────────────────────────────────
if ! gcloud compute addresses describe "${PUBLIC_IP_NAME}" --project="${WC_GCP_PROJECT_ID}" --global >/dev/null 2>&1; then
  run_capture create_global_ip gcloud compute addresses create "${PUBLIC_IP_NAME}" \
    --project="${WC_GCP_PROJECT_ID}" --global
else
  log "Global IP already exists: ${PUBLIC_IP_NAME}"
fi

GLOBAL_IP="$(
  gcloud compute addresses describe "${PUBLIC_IP_NAME}" \
    --project="${WC_GCP_PROJECT_ID}" --global \
    --format="value(address)"
)"
[[ -n "${GLOBAL_IP}" ]] || fail "Failed to resolve global IP address"
echo "${GLOBAL_IP}" > "${EVIDENCE_RUN_DIR}/global_ip.txt"

# ─── SERVERLESS NEG ──────────────────────────────────────────────────────────
if ! gcloud compute network-endpoint-groups describe "${WC_NEG_NAME}" \
  --project="${WC_GCP_PROJECT_ID}" --region="${WC_GCP_REGION}" >/dev/null 2>&1; then
  run_capture create_neg gcloud compute network-endpoint-groups create "${WC_NEG_NAME}" \
    --project="${WC_GCP_PROJECT_ID}" \
    --region="${WC_GCP_REGION}" \
    --network-endpoint-type=serverless \
    --cloud-run-service="${WC_API_SERVICE}"
else
  log "NEG already exists: ${WC_NEG_NAME}"
fi

# ─── CLOUD ARMOR ─────────────────────────────────────────────────────────────
if ! gcloud compute security-policies describe "${WC_ARMOR_POLICY_NAME}" \
  --project="${WC_GCP_PROJECT_ID}" >/dev/null 2>&1; then
  run_capture create_cloud_armor gcloud compute security-policies create "${WC_ARMOR_POLICY_NAME}" \
    --project="${WC_GCP_PROJECT_ID}" \
    --description="WorkCaptain Phase 5 semi-public beta baseline policy"
  run_capture armor_rule_1000 gcloud compute security-policies rules create 1000 \
    --project="${WC_GCP_PROJECT_ID}" \
    --security-policy="${WC_ARMOR_POLICY_NAME}" \
    --expression="evaluatePreconfiguredWaf('sqli-v33-stable') || evaluatePreconfiguredWaf('xss-v33-stable')" \
    --action=deny-403 \
    --description="Deny basic WAF matched requests"
  run_capture armor_rule_2000 gcloud compute security-policies rules create 2000 \
    --project="${WC_GCP_PROJECT_ID}" \
    --security-policy="${WC_ARMOR_POLICY_NAME}" \
    --src-ip-ranges="*" \
    --action=rate-based-ban \
    --rate-limit-threshold-count=200 \
    --rate-limit-threshold-interval-sec=60 \
    --ban-duration-sec=300 \
    --conform-action=allow \
    --exceed-action=deny-429 \
    --enforce-on-key=IP \
    --description="Baseline rate limiting"
else
  log "Cloud Armor policy already exists: ${WC_ARMOR_POLICY_NAME}"
fi

# ─── BACKEND SERVICE ─────────────────────────────────────────────────────────
if ! gcloud compute backend-services describe "${WC_BACKEND_SERVICE_NAME}" \
  --project="${WC_GCP_PROJECT_ID}" --global >/dev/null 2>&1; then
  run_capture create_backend_service gcloud compute backend-services create "${WC_BACKEND_SERVICE_NAME}" \
    --project="${WC_GCP_PROJECT_ID}" \
    --global \
    --load-balancing-scheme=EXTERNAL_MANAGED \
    --protocol=HTTP \
    --port-name=http \
    --timeout=30s \
    --security-policy="${WC_ARMOR_POLICY_NAME}"
else
  log "Backend service already exists: ${WC_BACKEND_SERVICE_NAME}"
fi

if ! gcloud compute backend-services describe "${WC_BACKEND_SERVICE_NAME}" \
  --project="${WC_GCP_PROJECT_ID}" --global \
  --format="get(backends[].group)" 2>/dev/null | grep -q "${WC_NEG_NAME}"; then
  run_capture attach_neg_to_backend gcloud compute backend-services add-backend "${WC_BACKEND_SERVICE_NAME}" \
    --project="${WC_GCP_PROJECT_ID}" \
    --global \
    --network-endpoint-group="${WC_NEG_NAME}" \
    --network-endpoint-group-region="${WC_GCP_REGION}"
else
  log "NEG already attached to backend service"
fi

# ─── URL MAP ─────────────────────────────────────────────────────────────────
if ! gcloud compute url-maps describe "${WC_URL_MAP_NAME}" \
  --project="${WC_GCP_PROJECT_ID}" >/dev/null 2>&1; then
  run_capture create_url_map gcloud compute url-maps create "${WC_URL_MAP_NAME}" \
    --project="${WC_GCP_PROJECT_ID}" \
    --default-service="${WC_BACKEND_SERVICE_NAME}"
else
  log "URL map already exists: ${WC_URL_MAP_NAME}"
fi

# ─── MANAGED CERT ────────────────────────────────────────────────────────────
if ! gcloud compute ssl-certificates describe "${WC_CERT_NAME}" \
  --project="${WC_GCP_PROJECT_ID}" --global >/dev/null 2>&1; then
  run_capture create_managed_cert gcloud compute ssl-certificates create "${WC_CERT_NAME}" \
    --project="${WC_GCP_PROJECT_ID}" --global \
    --domains="${WC_DOMAIN}"
else
  log "Managed certificate already exists: ${WC_CERT_NAME}"
fi

# ─── HTTPS PROXY ─────────────────────────────────────────────────────────────
if ! gcloud compute target-https-proxies describe "${WC_HTTPS_PROXY_NAME}" \
  --project="${WC_GCP_PROJECT_ID}" >/dev/null 2>&1; then
  run_capture create_https_proxy gcloud compute target-https-proxies create "${WC_HTTPS_PROXY_NAME}" \
    --project="${WC_GCP_PROJECT_ID}" \
    --url-map="${WC_URL_MAP_NAME}" \
    --ssl-certificates="${WC_CERT_NAME}"
else
  log "HTTPS proxy already exists: ${WC_HTTPS_PROXY_NAME}"
fi

# ─── FORWARDING RULE ─────────────────────────────────────────────────────────
if ! gcloud compute forwarding-rules describe "${WC_FORWARDING_RULE_NAME}" \
  --project="${WC_GCP_PROJECT_ID}" --global >/dev/null 2>&1; then
  run_capture create_forwarding_rule gcloud compute forwarding-rules create "${WC_FORWARDING_RULE_NAME}" \
    --project="${WC_GCP_PROJECT_ID}" --global \
    --load-balancing-scheme=EXTERNAL_MANAGED \
    --network-tier=PREMIUM \
    --address="${PUBLIC_IP_NAME}" \
    --target-https-proxy="${WC_HTTPS_PROXY_NAME}" \
    --ports=443
else
  log "Forwarding rule already exists: ${WC_FORWARDING_RULE_NAME}"
fi

# ─── DNS INSTRUCTIONS ────────────────────────────────────────────────────────
run_capture dns_zone_describe gcloud dns managed-zones describe "${WC_DNS_ZONE}" \
  --project="${WC_GCP_PROJECT_ID}"

cat > "${EVIDENCE_RUN_DIR}/dns_record_instructions.txt" <<DNS
Create or update the DNS record for:
Host: ${WC_DOMAIN}
Type: A
Value: ${GLOBAL_IP}
DNS

log "DNS instructions recorded at ${EVIDENCE_RUN_DIR}/dns_record_instructions.txt"

# ─── PRE-CERT RESOURCE CAPTURES ─────────────────────────────────────────────
run_capture backend_service_describe gcloud compute backend-services describe \
  "${WC_BACKEND_SERVICE_NAME}" --project="${WC_GCP_PROJECT_ID}" --global
run_capture neg_describe gcloud compute network-endpoint-groups describe \
  "${WC_NEG_NAME}" --project="${WC_GCP_PROJECT_ID}" --region="${WC_GCP_REGION}"
run_capture url_map_describe gcloud compute url-maps describe \
  "${WC_URL_MAP_NAME}" --project="${WC_GCP_PROJECT_ID}"
run_capture cert_describe_initial gcloud compute ssl-certificates describe \
  "${WC_CERT_NAME}" --project="${WC_GCP_PROJECT_ID}" --global
run_capture forwarding_rule_describe gcloud compute forwarding-rules describe \
  "${WC_FORWARDING_RULE_NAME}" --project="${WC_GCP_PROJECT_ID}" --global
run_capture armor_describe gcloud compute security-policies describe \
  "${WC_ARMOR_POLICY_NAME}" --project="${WC_GCP_PROJECT_ID}"

# ─── DNS WAIT ────────────────────────────────────────────────────────────────
log "Waiting for DNS visibility on ${WC_DOMAIN}"
for _ in $(seq 1 30); do
  if dig +short "${WC_DOMAIN}" | grep -q "${GLOBAL_IP}"; then
    log "DNS now resolves ${WC_DOMAIN} -> ${GLOBAL_IP}"
    break
  fi
  sleep 20
done
dig +short "${WC_DOMAIN}" > "${EVIDENCE_RUN_DIR}/dig_domain.log" 2>&1 || true

# ─── CERT WAIT ───────────────────────────────────────────────────────────────
log "Waiting for managed certificate activation"
CERT_STATUS=""
DOMAIN_STATUS=""
for _ in $(seq 1 60); do
  CERT_STATUS="$(
    gcloud compute ssl-certificates describe "${WC_CERT_NAME}" \
      --project="${WC_GCP_PROJECT_ID}" --global \
      --format="value(managed.status)"
  )"
  DOMAIN_STATUS="$(
    gcloud compute ssl-certificates describe "${WC_CERT_NAME}" \
      --project="${WC_GCP_PROJECT_ID}" --global \
      --format="value(managed.domainStatus.${WC_DOMAIN})"
  )"
  echo "CERT_STATUS=${CERT_STATUS}" >> "${EVIDENCE_RUN_DIR}/cert_status.log"
  echo "DOMAIN_STATUS=${DOMAIN_STATUS}" >> "${EVIDENCE_RUN_DIR}/cert_status.log"
  if [[ "${CERT_STATUS}" == "ACTIVE" && "${DOMAIN_STATUS}" == "ACTIVE" ]]; then
    log "Managed certificate is ACTIVE"
    break
  fi
  sleep 30
done

[[ "${CERT_STATUS}" == "ACTIVE" && "${DOMAIN_STATUS}" == "ACTIVE" ]] || \
  fail "Managed certificate did not become ACTIVE"

# ─── ROUTE VERIFICATION ──────────────────────────────────────────────────────
ALLOWED_URL="https://${WC_DOMAIN}${WC_HEALTH_PATH}"
FORBIDDEN_URL="https://${WC_DOMAIN}${WC_FORBIDDEN_PATH}"

curl -i --max-time 30 "${ALLOWED_URL}" > "${EVIDENCE_RUN_DIR}/allowed_route_check.log" 2>&1 || \
  fail "Allowed route check failed"
curl -i --max-time 30 "${FORBIDDEN_URL}" > "${EVIDENCE_RUN_DIR}/forbidden_route_check.log" 2>&1 || true

# ─── FINAL CAPTURES ──────────────────────────────────────────────────────────
run_capture cert_describe_final gcloud compute ssl-certificates describe \
  "${WC_CERT_NAME}" --project="${WC_GCP_PROJECT_ID}" --global
run_capture list_forwarding_rules gcloud compute forwarding-rules list \
  --project="${WC_GCP_PROJECT_ID}" --global
run_capture list_backend_services gcloud compute backend-services list \
  --project="${WC_GCP_PROJECT_ID}" --global
run_capture list_security_policies gcloud compute security-policies list \
  --project="${WC_GCP_PROJECT_ID}"

# ─── ROLLBACK COMMANDS ───────────────────────────────────────────────────────
cat > "${EVIDENCE_RUN_DIR}/ROLLBACK_COMMANDS.txt" <<ROLLBACK
# Option A: remove forwarding rule
gcloud compute forwarding-rules delete "${WC_FORWARDING_RULE_NAME}" --project="${WC_GCP_PROJECT_ID}" --global --quiet

# Option B: delete HTTPS proxy
gcloud compute target-https-proxies delete "${WC_HTTPS_PROXY_NAME}" --project="${WC_GCP_PROJECT_ID}" --quiet

# Option C: delete URL map and backend service
gcloud compute url-maps delete "${WC_URL_MAP_NAME}" --project="${WC_GCP_PROJECT_ID}" --quiet
gcloud compute backend-services delete "${WC_BACKEND_SERVICE_NAME}" --project="${WC_GCP_PROJECT_ID}" --global --quiet

# Option D: revert DNS
# Revert the A record for ${WC_DOMAIN} away from ${GLOBAL_IP}
ROLLBACK

# ─── MANIFEST ────────────────────────────────────────────────────────────────
cat > "${EVIDENCE_RUN_DIR}/MANIFEST.txt" <<MANIFEST
PHASE=WORKCAPTAIN-PHASE-5-SEMI-PUBLIC-BETA-LAUNCH
TIMESTAMP=${TIMESTAMP}
PROJECT=${WC_GCP_PROJECT_ID}
REGION=${WC_GCP_REGION}
ENV=${WC_GCP_ENV}
DOMAIN=${WC_DOMAIN}
GLOBAL_IP=${GLOBAL_IP}
EVIDENCE_RUN_DIR=${EVIDENCE_RUN_DIR}
MANIFEST

log "COMPLETE Phase 5 semi-public beta launch"
echo "EVIDENCE_RUN_DIR=${EVIDENCE_RUN_DIR}"
