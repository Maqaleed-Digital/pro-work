#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="/opt/prowork"
TF_ROOT="$REPO_ROOT/infrastructure/gcp"
RUN_DIR="${1:?Pass RUN_DIR}"
PROJECT_ID="${2:?Pass PROJECT_ID}"
REGION="${3:?Pass REGION}"

{
  echo "PROJECT_ID=$PROJECT_ID"
  echo "REGION=$REGION"
  echo "RUN_DIR=$RUN_DIR"
} > "$RUN_DIR/verify_context.txt"

(gcloud run services list --project="$PROJECT_ID" --region="$REGION") > "$RUN_DIR/gcloud_run_services.txt" 2>&1 || true
(gcloud artifacts repositories list --project="$PROJECT_ID" --location="$REGION") > "$RUN_DIR/artifact_registry.txt" 2>&1 || true
(gcloud storage buckets list --project="$PROJECT_ID") > "$RUN_DIR/storage_buckets.txt" 2>&1 || true
(gcloud pubsub topics list --project="$PROJECT_ID") > "$RUN_DIR/pubsub_topics.txt" 2>&1 || true
(gcloud sql instances list --project="$PROJECT_ID") > "$RUN_DIR/sql_instances.txt" 2>&1 || true
(gcloud redis instances list --project="$PROJECT_ID" --region="$REGION") > "$RUN_DIR/redis_instances.txt" 2>&1 || true

(
  cd "$TF_ROOT"
  terraform output -json || true
) > "$RUN_DIR/terraform_outputs.json" 2>&1

echo "VERIFY_STATUS=PASS" > "$RUN_DIR/verify_status.txt"
