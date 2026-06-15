#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="/opt/prowork"
EVIDENCE_BASE="$REPO_ROOT/evidence/workcaptain/phase4-real-runtime-cutover"

: "${WC_GCP_PROJECT_ID:=prj-maq-workcaptain-nonprod}"
: "${WC_GCP_REGION:=me-central2}"
: "${WC_GCP_ENV:=dev}"

PROJECT_ID="$WC_GCP_PROJECT_ID"
REGION="$WC_GCP_REGION"
ENV="$WC_GCP_ENV"

: "${API_IMAGE_URI:?Set API_IMAGE_URI}"
: "${TRUST_IMAGE_URI:?Set TRUST_IMAGE_URI}"
: "${AGENT_IMAGE_URI:?Set AGENT_IMAGE_URI}"
: "${WORKER_IMAGE_URI:?Set WORKER_IMAGE_URI}"

if [ "$PROJECT_ID" != "prj-maq-workcaptain-nonprod" ]; then
  echo "ERROR: This pack is locked to prj-maq-workcaptain-nonprod"
  exit 1
fi

if [ "$ENV" != "dev" ]; then
  echo "ERROR: WC_GCP_ENV must be dev for this phase"
  exit 1
fi

for image in "$API_IMAGE_URI" "$TRUST_IMAGE_URI" "$AGENT_IMAGE_URI" "$WORKER_IMAGE_URI"; do
  if echo "$image" | grep -q ':latest$'; then
    echo "ERROR: latest tags are not permitted for Phase 4 real cutover"
    exit 1
  fi
done

RUN_TS="$(date -u +"%Y%m%dT%H%M%SZ")"
RUN_DIR="$EVIDENCE_BASE/$RUN_TS"
mkdir -p "$RUN_DIR"

RUN_STATUS="FAIL"
finalize_manifest() {
  {
    echo "RUN_DIR=$RUN_DIR"
    echo "STATUS=$RUN_STATUS"
    echo "PHASE=WORKCAPTAIN-PHASE-4-REAL-RUNTIME-CUTOVER-AND-INTERNAL-ALPHA"
    echo "PROJECT_ID=$PROJECT_ID"
    echo "REGION=$REGION"
    echo "ENV=$ENV"
    echo "API_IMAGE_URI=$API_IMAGE_URI"
    echo "TRUST_IMAGE_URI=$TRUST_IMAGE_URI"
    echo "AGENT_IMAGE_URI=$AGENT_IMAGE_URI"
    echo "WORKER_IMAGE_URI=$WORKER_IMAGE_URI"
  } > "$RUN_DIR/manifest.txt"
}
trap finalize_manifest EXIT

{
  echo "PROJECT_ID=$PROJECT_ID"
  echo "REGION=$REGION"
  echo "ENV=$ENV"
  echo "API_IMAGE_URI=$API_IMAGE_URI"
  echo "TRUST_IMAGE_URI=$TRUST_IMAGE_URI"
  echo "AGENT_IMAGE_URI=$AGENT_IMAGE_URI"
  echo "WORKER_IMAGE_URI=$WORKER_IMAGE_URI"
} > "$RUN_DIR/env_contract.txt"

git -C "$REPO_ROOT" rev-parse HEAD > "$RUN_DIR/git_head.txt"
git -C "$REPO_ROOT" branch --show-current > "$RUN_DIR/branch.txt"
(gcloud version || true) > "$RUN_DIR/gcloud_version.txt" 2>&1

if ! gcloud auth application-default print-access-token >/dev/null 2>&1; then
  echo "ERROR: ADC not valid." | tee "$RUN_DIR/adc_check.txt"
  exit 1
fi
echo "ADC_STATUS=PASS" > "$RUN_DIR/adc_check.txt"

declare -A SERVICES
SERVICES["api-service"]="$API_IMAGE_URI"
SERVICES["trust-processor"]="$TRUST_IMAGE_URI"
SERVICES["agent-orchestrator"]="$AGENT_IMAGE_URI"
SERVICES["background-worker"]="$WORKER_IMAGE_URI"

for svc in api-service trust-processor agent-orchestrator background-worker; do
  image="${SERVICES[$svc]}"

  gcloud artifacts docker images describe "$image" \
    > "$RUN_DIR/${svc}_image_describe.txt" 2>&1

  gcloud run services describe "$svc" \
    --project="$PROJECT_ID" \
    --region="$REGION" \
    --format=json > "$RUN_DIR/${svc}_before.json" 2>&1

  gcloud run services describe "$svc" \
    --project="$PROJECT_ID" \
    --region="$REGION" \
    --format="value(status.latestReadyRevisionName)" > "$RUN_DIR/${svc}_before_revision.txt" 2>&1

  gcloud run deploy "$svc" \
    --project="$PROJECT_ID" \
    --region="$REGION" \
    --platform=managed \
    --image="$image" \
    > "$RUN_DIR/${svc}_deploy.txt" 2>&1

  gcloud run services describe "$svc" \
    --project="$PROJECT_ID" \
    --region="$REGION" \
    --format=json > "$RUN_DIR/${svc}_after.json" 2>&1

  gcloud run services describe "$svc" \
    --project="$PROJECT_ID" \
    --region="$REGION" \
    --format="value(status.url)" > "$RUN_DIR/${svc}_url.txt" 2>&1
done

TOKEN="$(gcloud auth print-identity-token)"
for svc in api-service trust-processor agent-orchestrator background-worker; do
  url="$(cat "$RUN_DIR/${svc}_url.txt" | tr -d '\r')"
  {
    echo "SERVICE=$svc"
    echo "URL=$url"
    curl -sS -H "Authorization: Bearer $TOKEN" "$url"
    echo ""
    curl -sS -H "Authorization: Bearer $TOKEN" "$url/health"
    echo ""
    echo "---"
  } > "$RUN_DIR/${svc}_verify.txt" 2>&1
done

RUN_STATUS="PASS"
echo "REAL_RUNTIME_CUTOVER_STATUS=PASS" > "$RUN_DIR/verify_status.txt"
echo "CUTOVER_RUN_DIR=$RUN_DIR"
echo "CUTOVER_STATUS=PASS"
