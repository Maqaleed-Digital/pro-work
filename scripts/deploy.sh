#!/usr/bin/env bash
# WorkCaptain — GCP deploy helper
# Usage: ./scripts/deploy.sh <env> <service> [image_tag]
set -euo pipefail

ENV="${1:?ENV required: dev|staging|production}"
SERVICE="${2:?SERVICE required: api-service|trust-processor|agent-orchestrator|background-worker|admin-console}"
TAG="${3:-latest}"

PROJECT_ID="$(gcloud config get-value project)"
REGION="${REGION:-me-central1}"
REGISTRY="${REGION}-docker.pkg.dev/${PROJECT_ID}/workcaptain"
IMAGE="${REGISTRY}/${SERVICE}:${TAG}"

echo "==> Deploying WorkCaptain"
echo "    env=$ENV service=$SERVICE tag=$TAG"
echo "    image=$IMAGE"

gcloud run deploy "$SERVICE" \
  --image "$IMAGE" \
  --region "$REGION" \
  --set-env-vars "ENV=${ENV}" \
  --quiet

echo "==> Deploy complete: $SERVICE ($ENV)"
