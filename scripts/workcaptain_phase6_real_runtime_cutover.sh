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

reject_latest() {
  local name="$1"
  local value="$2"
  [[ "${value}" != *":latest" ]] || fail "${name} must not use :latest"
  [[ "${value}" == *":"* || "${value}" == *"@sha256:"* ]] || fail "${name} must use immutable tag or digest"
}

capture_service_state() {
  local service="$1"
  local prefix="$2"

  gcloud run services describe "${service}" \
    --project="${WC_GCP_PROJECT_ID}" \
    --region="${WC_GCP_REGION}" \
    --format=json > "${EVIDENCE_RUN_DIR}/${prefix}_${service}_service.json"

  gcloud run revisions list \
    --project="${WC_GCP_PROJECT_ID}" \
    --region="${WC_GCP_REGION}" \
    --service="${service}" \
    --format=json > "${EVIDENCE_RUN_DIR}/${prefix}_${service}_revisions.json"
}

deploy_service() {
  local service="$1"
  local image_uri="$2"
  local prefix="$3"

  log "Deploying ${service} with ${image_uri}"
  gcloud run deploy "${service}" \
    --project="${WC_GCP_PROJECT_ID}" \
    --region="${WC_GCP_REGION}" \
    --image="${image_uri}" \
    --quiet > "${EVIDENCE_RUN_DIR}/${prefix}_${service}_deploy.log" 2>&1
}

latest_ready_revision() {
  local service="$1"
  gcloud run services describe "${service}" \
    --project="${WC_GCP_PROJECT_ID}" \
    --region="${WC_GCP_REGION}" \
    --format="value(status.latestReadyRevisionName)"
}

require_cmd gcloud
require_cmd curl
require_cmd date
require_cmd mkdir
require_cmd tee

require_env WC_GCP_PROJECT_ID
require_env WC_GCP_REGION
require_env WC_GCP_ENV
require_env API_IMAGE_URI
require_env TRUST_IMAGE_URI
require_env AGENT_IMAGE_URI
require_env WORKER_IMAGE_URI

reject_latest API_IMAGE_URI "${API_IMAGE_URI}"
reject_latest TRUST_IMAGE_URI "${TRUST_IMAGE_URI}"
reject_latest AGENT_IMAGE_URI "${AGENT_IMAGE_URI}"
reject_latest WORKER_IMAGE_URI "${WORKER_IMAGE_URI}"

TIMESTAMP="$(date -u +"%Y%m%dT%H%M%SZ")"
EVIDENCE_RUN_DIR="FND/EVIDENCE/WORKCAPTAIN-PHASE-6-REAL-RUNTIME-CUTOVER/${TIMESTAMP}"
mkdir -p "${EVIDENCE_RUN_DIR}"

log() {
  echo "[$(date -u +"%Y-%m-%dT%H:%M:%SZ")] $*" | tee -a "${EVIDENCE_RUN_DIR}/decision_log.txt"
}

log "START Phase 6 real runtime cutover"
log "Project=${WC_GCP_PROJECT_ID} Region=${WC_GCP_REGION} Env=${WC_GCP_ENV}"

cat > "${EVIDENCE_RUN_DIR}/requested_images.txt" <<IMAGES
API_IMAGE_URI=${API_IMAGE_URI}
TRUST_IMAGE_URI=${TRUST_IMAGE_URI}
AGENT_IMAGE_URI=${AGENT_IMAGE_URI}
WORKER_IMAGE_URI=${WORKER_IMAGE_URI}
IMAGES

capture_service_state "api-service" "pre"
capture_service_state "trust-processor" "pre"
capture_service_state "agent-orchestrator" "pre"
capture_service_state "background-worker" "pre"

PRE_API_REV="$(latest_ready_revision api-service)"
PRE_TRUST_REV="$(latest_ready_revision trust-processor)"
PRE_AGENT_REV="$(latest_ready_revision agent-orchestrator)"
PRE_WORKER_REV="$(latest_ready_revision background-worker)"

cat > "${EVIDENCE_RUN_DIR}/pre_revisions.txt" <<PRE
api-service=${PRE_API_REV}
trust-processor=${PRE_TRUST_REV}
agent-orchestrator=${PRE_AGENT_REV}
background-worker=${PRE_WORKER_REV}
PRE

deploy_service "api-service" "${API_IMAGE_URI}" "deploy"
deploy_service "trust-processor" "${TRUST_IMAGE_URI}" "deploy"
deploy_service "agent-orchestrator" "${AGENT_IMAGE_URI}" "deploy"
deploy_service "background-worker" "${WORKER_IMAGE_URI}" "deploy"

capture_service_state "api-service" "post"
capture_service_state "trust-processor" "post"
capture_service_state "agent-orchestrator" "post"
capture_service_state "background-worker" "post"

POST_API_REV="$(latest_ready_revision api-service)"
POST_TRUST_REV="$(latest_ready_revision trust-processor)"
POST_AGENT_REV="$(latest_ready_revision agent-orchestrator)"
POST_WORKER_REV="$(latest_ready_revision background-worker)"

cat > "${EVIDENCE_RUN_DIR}/post_revisions.txt" <<POST
api-service=${POST_API_REV}
trust-processor=${POST_TRUST_REV}
agent-orchestrator=${POST_AGENT_REV}
background-worker=${POST_WORKER_REV}
POST

[[ -n "${POST_API_REV}" ]] || fail "api-service has no latest ready revision"
[[ -n "${POST_TRUST_REV}" ]] || fail "trust-processor has no latest ready revision"
[[ -n "${POST_AGENT_REV}" ]] || fail "agent-orchestrator has no latest ready revision"
[[ -n "${POST_WORKER_REV}" ]] || fail "background-worker has no latest ready revision"

curl -i --max-time 30 "https://api.workcaptain.ai/health" > "${EVIDENCE_RUN_DIR}/public_health_check.log" 2>&1 || fail "Public health check failed"
curl -i --max-time 30 "https://api.workcaptain.ai/admin" > "${EVIDENCE_RUN_DIR}/public_admin_check.log" 2>&1 || true

cat > "${EVIDENCE_RUN_DIR}/ROLLBACK_COMMANDS.txt" <<ROLLBACK
# Redeploy previous image/revision targets after reviewing pre-cutover evidence.
# Replace IMAGE_URI values below with the previously captured known-good image URI if needed.

gcloud run deploy api-service \
  --project="${WC_GCP_PROJECT_ID}" \
  --region="${WC_GCP_REGION}" \
  --image="PREVIOUS_API_IMAGE_URI" \
  --quiet

gcloud run deploy trust-processor \
  --project="${WC_GCP_PROJECT_ID}" \
  --region="${WC_GCP_REGION}" \
  --image="PREVIOUS_TRUST_IMAGE_URI" \
  --quiet

gcloud run deploy agent-orchestrator \
  --project="${WC_GCP_PROJECT_ID}" \
  --region="${WC_GCP_REGION}" \
  --image="PREVIOUS_AGENT_IMAGE_URI" \
  --quiet

gcloud run deploy background-worker \
  --project="${WC_GCP_PROJECT_ID}" \
  --region="${WC_GCP_REGION}" \
  --image="PREVIOUS_WORKER_IMAGE_URI" \
  --quiet
ROLLBACK

cat > "${EVIDENCE_RUN_DIR}/CARRY_FORWARD_NOTE.txt" <<NOTE
Reassess whether /admin remains publicly reachable after real runtime cutover.
If reachable, record whether intentional and carry route-boundary enforcement into next phase.
NOTE

cat > "${EVIDENCE_RUN_DIR}/MANIFEST.txt" <<MANIFEST
PHASE=WORKCAPTAIN-PHASE-6-REAL-RUNTIME-CUTOVER
TIMESTAMP=${TIMESTAMP}
PROJECT=${WC_GCP_PROJECT_ID}
REGION=${WC_GCP_REGION}
ENV=${WC_GCP_ENV}
EVIDENCE_RUN_DIR=${EVIDENCE_RUN_DIR}
PRE_API_REV=${PRE_API_REV}
PRE_TRUST_REV=${PRE_TRUST_REV}
PRE_AGENT_REV=${PRE_AGENT_REV}
PRE_WORKER_REV=${PRE_WORKER_REV}
POST_API_REV=${POST_API_REV}
POST_TRUST_REV=${POST_TRUST_REV}
POST_AGENT_REV=${POST_AGENT_REV}
POST_WORKER_REV=${POST_WORKER_REV}
MANIFEST

log "COMPLETE Phase 6 real runtime cutover"
echo "EVIDENCE_RUN_DIR=${EVIDENCE_RUN_DIR}"
