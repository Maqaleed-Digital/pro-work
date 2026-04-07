#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="/opt/prowork"
TF_ROOT="$REPO_ROOT/infrastructure/gcp"
EVIDENCE_BASE="$REPO_ROOT/evidence/workcaptain/gcp-foundation-validation"

required_env=(
  WC_GCP_PROJECT_ID
  WC_GCP_REGION
  WC_GCP_ENV
  WC_GCP_DB_TIER
)

for v in "${required_env[@]}"; do
  if [ -z "${!v:-}" ]; then
    echo "MISSING_REQUIRED_ENV=$v"
    exit 1
  fi
done

if [ "$WC_GCP_ENV" != "dev" ]; then
  echo "ERROR: WC_GCP_ENV must be dev for this phase."
  exit 1
fi

RUN_TS="$(date -u +"%Y%m%dT%H%M%SZ")"
RUN_DIR="$EVIDENCE_BASE/$RUN_TS"
mkdir -p "$RUN_DIR"

{
  echo "WC_GCP_PROJECT_ID=$WC_GCP_PROJECT_ID"
  echo "WC_GCP_REGION=$WC_GCP_REGION"
  echo "WC_GCP_ENV=$WC_GCP_ENV"
  echo "WC_GCP_DB_TIER=$WC_GCP_DB_TIER"
} > "$RUN_DIR/env_contract.txt"

git -C "$REPO_ROOT" rev-parse HEAD > "$RUN_DIR/git_head.txt"
git -C "$REPO_ROOT" branch --show-current > "$RUN_DIR/branch.txt"

(terraform version || true) > "$RUN_DIR/terraform_version.txt" 2>&1
(gcloud version || true) > "$RUN_DIR/gcloud_version.txt" 2>&1

if ! command -v terraform >/dev/null 2>&1; then
  echo "ERROR: terraform is not installed." | tee "$RUN_DIR/fmt.txt"
  exit 1
fi

if ! command -v gcloud >/dev/null 2>&1; then
  echo "ERROR: gcloud is not installed." | tee "$RUN_DIR/init.txt"
  exit 1
fi

if [ ! -f "$TF_ROOT/main.tf" ]; then
  echo "ERROR: Missing $TF_ROOT/main.tf"
  exit 1
fi

if [ ! -f "$TF_ROOT/variables.tf" ]; then
  echo "ERROR: Missing $TF_ROOT/variables.tf"
  exit 1
fi

if [ ! -f "$TF_ROOT/outputs.tf" ]; then
  echo "ERROR: Missing $TF_ROOT/outputs.tf"
  exit 1
fi

cat > "$TF_ROOT/env/dev/dev.tfvars" <<VARS
project_id = "$WC_GCP_PROJECT_ID"
region     = "$WC_GCP_REGION"
env        = "$WC_GCP_ENV"
db_tier    = "$WC_GCP_DB_TIER"
VARS

(
  cd "$TF_ROOT"
  terraform fmt -check -recursive
) > "$RUN_DIR/fmt.txt" 2>&1

(
  cd "$TF_ROOT"
  terraform init -input=false
) > "$RUN_DIR/init.txt" 2>&1

(
  cd "$TF_ROOT"
  terraform validate
) > "$RUN_DIR/validate.txt" 2>&1

(
  cd "$TF_ROOT"
  terraform plan -input=false -var-file="env/dev/dev.tfvars" -out="workcaptain-dev.tfplan"
) > "$RUN_DIR/plan.txt" 2>&1

if [ -f "$REPO_ROOT/scripts/deploy.sh" ]; then
  sed -n '1,20p' "$REPO_ROOT/scripts/deploy.sh" > "$RUN_DIR/deploy_script_head.txt"
fi

(
  cd "$TF_ROOT"
  terraform output -json || true
) > "$RUN_DIR/outputs_preview.txt" 2>&1

{
  echo "RUN_DIR=$RUN_DIR"
  echo "STATUS=PASS"
  echo "PHASE=WORKCAPTAIN-PHASE-1-GCP-FOUNDATION-VALIDATION"
  echo "ENV=dev"
  echo "PROJECT_ID=$WC_GCP_PROJECT_ID"
  echo "REGION=$WC_GCP_REGION"
} > "$RUN_DIR/manifest.txt"

echo "VALIDATION_RUN_DIR=$RUN_DIR"
echo "VALIDATION_STATUS=PASS"
