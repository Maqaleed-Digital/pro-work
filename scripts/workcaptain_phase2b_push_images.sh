#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="/opt/prowork"
PROJECT_ID="${WC_GCP_PROJECT_ID:?Set WC_GCP_PROJECT_ID}"
REGION="${WC_GCP_REGION:-me-central2}"
REGISTRY="${REGION}-docker.pkg.dev/${PROJECT_ID}/workcaptain"
EVIDENCE_DIR="${REPO_ROOT}/evidence/workcaptain/phase2b-images"
RUN_TS="$(date -u +"%Y%m%dT%H%M%SZ")"
RUN_DIR="${EVIDENCE_DIR}/${RUN_TS}"
mkdir -p "$RUN_DIR"

SERVICES=(api-service trust-processor agent-orchestrator background-worker)

git -C "$REPO_ROOT" rev-parse HEAD > "$RUN_DIR/git_head.txt"
docker version > "$RUN_DIR/docker_version.txt" 2>&1

echo "=== CONFIGURING DOCKER AUTH ===" | tee "$RUN_DIR/auth.txt"
gcloud auth configure-docker "${REGION}-docker.pkg.dev" --quiet >> "$RUN_DIR/auth.txt" 2>&1

echo "=== BUILDING PLACEHOLDER IMAGE ===" | tee "$RUN_DIR/build.txt"
docker build \
  -t "workcaptain-placeholder:local" \
  "${REPO_ROOT}/docker/placeholder" >> "$RUN_DIR/build.txt" 2>&1
echo "BUILD_STATUS=PASS" | tee -a "$RUN_DIR/build.txt"

echo "=== PUSHING SERVICE IMAGES ===" | tee "$RUN_DIR/push.txt"
for svc in "${SERVICES[@]}"; do
  IMAGE="${REGISTRY}/${svc}:latest"
  docker tag workcaptain-placeholder:local "$IMAGE"
  docker push "$IMAGE" >> "$RUN_DIR/push.txt" 2>&1
  echo "PUSHED=$IMAGE" | tee -a "$RUN_DIR/push.txt"
done
echo "PUSH_STATUS=PASS" | tee -a "$RUN_DIR/push.txt"

echo "=== VERIFYING IMAGES IN REGISTRY ===" | tee "$RUN_DIR/verify.txt"
for svc in "${SERVICES[@]}"; do
  gcloud artifacts docker images list \
    "${REGISTRY}/${svc}" \
    --project="$PROJECT_ID" \
    --limit=1 >> "$RUN_DIR/verify.txt" 2>&1
done

{
  echo "RUN_DIR=$RUN_DIR"
  echo "STATUS=PASS"
  echo "PHASE=WORKCAPTAIN-PHASE-2B"
  echo "REGISTRY=$REGISTRY"
  echo "SERVICES=${SERVICES[*]}"
} > "$RUN_DIR/manifest.txt"

echo "PHASE2B_IMAGES_RUN_DIR=$RUN_DIR"
echo "PHASE2B_IMAGES_STATUS=PASS"
