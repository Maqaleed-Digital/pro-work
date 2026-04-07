#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="/opt/prowork"
TF_ROOT="$REPO_ROOT/infrastructure/gcp"
EVIDENCE_BASE="$REPO_ROOT/evidence/workcaptain/gcp-nonprod-activation"

: "${WC_GCP_PROJECT_ID:?Set WC_GCP_PROJECT_ID}"
: "${WC_GCP_REGION:=me-central2}"
: "${WC_GCP_ENV:=dev}"
: "${WC_GCP_DB_TIER:=db-custom-1-3840}"

PROJECT_ID="$WC_GCP_PROJECT_ID"
REGION="$WC_GCP_REGION"
ENV="$WC_GCP_ENV"
DB_TIER="$WC_GCP_DB_TIER"
STATE_BUCKET="workcaptain-tfstate"
STATE_PREFIX="nonprod/dev"
AR_REPO="workcaptain"

if [ "$PROJECT_ID" != "prj-maq-workcaptain-nonprod" ]; then
  echo "ERROR: This pack is locked to prj-maq-workcaptain-nonprod"
  exit 1
fi

if [ "$ENV" != "dev" ]; then
  echo "ERROR: WC_GCP_ENV must be dev for this phase"
  exit 1
fi

RUN_TS="$(date -u +"%Y%m%dT%H%M%SZ")"
RUN_DIR="$EVIDENCE_BASE/$RUN_TS"
mkdir -p "$RUN_DIR"

{
  echo "PROJECT_ID=$PROJECT_ID"
  echo "REGION=$REGION"
  echo "ENV=$ENV"
  echo "DB_TIER=$DB_TIER"
  echo "STATE_BUCKET=$STATE_BUCKET"
  echo "STATE_PREFIX=$STATE_PREFIX"
  echo "AR_REPO=$AR_REPO"
} > "$RUN_DIR/env_contract.txt"

git -C "$REPO_ROOT" rev-parse HEAD > "$RUN_DIR/git_head.txt"
git -C "$REPO_ROOT" branch --show-current > "$RUN_DIR/branch.txt"
(terraform version || true) > "$RUN_DIR/terraform_version.txt" 2>&1
(gcloud version || true) > "$RUN_DIR/gcloud_version.txt" 2>&1

# ─────────────────────────────────────────────────────────────────────────────
# ADC CHECK
# ─────────────────────────────────────────────────────────────────────────────
echo "=== ADC CHECK ===" | tee "$RUN_DIR/adc_check.txt"
if ! gcloud auth application-default print-access-token >/dev/null 2>&1; then
  echo "ERROR: ADC not valid. Run:" | tee -a "$RUN_DIR/adc_check.txt"
  echo "  gcloud auth application-default login" | tee -a "$RUN_DIR/adc_check.txt"
  echo "  gcloud auth application-default set-quota-project \"$PROJECT_ID\"" | tee -a "$RUN_DIR/adc_check.txt"
  exit 1
fi
echo "ADC_STATUS=PASS" | tee -a "$RUN_DIR/adc_check.txt"

# ─────────────────────────────────────────────────────────────────────────────
# PROJECT CHECK
# ─────────────────────────────────────────────────────────────────────────────
echo "=== PROJECT CHECK ===" | tee "$RUN_DIR/project_check.txt"
gcloud config get-value project | tee -a "$RUN_DIR/project_check.txt"
gcloud projects describe "$PROJECT_ID" > "$RUN_DIR/project_describe.txt" 2>&1
gcloud billing projects describe "$PROJECT_ID" > "$RUN_DIR/billing_describe.txt" 2>&1

# ─────────────────────────────────────────────────────────────────────────────
# REMOTE STATE BUCKET BOOTSTRAP
# ─────────────────────────────────────────────────────────────────────────────
echo "=== REMOTE STATE BUCKET ===" | tee "$RUN_DIR/state_bucket.txt"
if gcloud storage buckets describe "gs://$STATE_BUCKET" --project="$PROJECT_ID" > "$RUN_DIR/state_bucket_describe.txt" 2>&1; then
  echo "STATE_BUCKET_EXISTS=YES" | tee -a "$RUN_DIR/state_bucket.txt"
else
  echo "STATE_BUCKET_EXISTS=NO — creating" | tee -a "$RUN_DIR/state_bucket.txt"
  gcloud storage buckets create "gs://$STATE_BUCKET" \
    --project="$PROJECT_ID" \
    --location="$REGION" \
    --uniform-bucket-level-access > "$RUN_DIR/state_bucket_create.txt" 2>&1
  gcloud storage buckets update "gs://$STATE_BUCKET" \
    --versioning > "$RUN_DIR/state_bucket_versioning.txt" 2>&1
fi
gcloud storage buckets describe "gs://$STATE_BUCKET" --project="$PROJECT_ID" > "$RUN_DIR/state_bucket_final.txt" 2>&1

# ─────────────────────────────────────────────────────────────────────────────
# ARTIFACT REGISTRY BOOTSTRAP
# ─────────────────────────────────────────────────────────────────────────────
echo "=== ARTIFACT REGISTRY ===" | tee "$RUN_DIR/artifact_registry_check.txt"
if gcloud artifacts repositories describe "$AR_REPO" \
  --project="$PROJECT_ID" \
  --location="$REGION" > "$RUN_DIR/artifact_registry_describe.txt" 2>&1; then
  echo "ARTIFACT_REGISTRY_EXISTS=YES" | tee -a "$RUN_DIR/artifact_registry_check.txt"
else
  echo "ARTIFACT_REGISTRY_EXISTS=NO — creating" | tee -a "$RUN_DIR/artifact_registry_check.txt"
  gcloud artifacts repositories create "$AR_REPO" \
    --project="$PROJECT_ID" \
    --location="$REGION" \
    --repository-format=docker \
    --description="WorkCaptain nonprod images" > "$RUN_DIR/artifact_registry_create.txt" 2>&1
fi
gcloud artifacts repositories describe "$AR_REPO" \
  --project="$PROJECT_ID" \
  --location="$REGION" > "$RUN_DIR/artifact_registry_final.txt" 2>&1

# ─────────────────────────────────────────────────────────────────────────────
# TFVARS + BACKEND CONFIG
# ─────────────────────────────────────────────────────────────────────────────
mkdir -p "$TF_ROOT/env/dev"

cat > "$TF_ROOT/env/dev/dev.tfvars" <<VARS
project_id = "$PROJECT_ID"
region     = "$REGION"
env        = "$ENV"
db_tier    = "$DB_TIER"
VARS

cat > "$TF_ROOT/env/dev/backend.hcl" <<BACKEND
bucket = "$STATE_BUCKET"
prefix = "$STATE_PREFIX"
BACKEND

# ─────────────────────────────────────────────────────────────────────────────
# TERRAFORM FMT / INIT / VALIDATE / PLAN / APPLY
# ─────────────────────────────────────────────────────────────────────────────
(
  cd "$TF_ROOT"
  terraform fmt -check -recursive
) > "$RUN_DIR/fmt.txt" 2>&1

(
  cd "$TF_ROOT"
  terraform init -input=false -reconfigure -backend-config="env/dev/backend.hcl"
) > "$RUN_DIR/init.txt" 2>&1

(
  cd "$TF_ROOT"
  terraform validate
) > "$RUN_DIR/validate.txt" 2>&1

(
  cd "$TF_ROOT"
  terraform plan -input=false -var-file="env/dev/dev.tfvars" -out="workcaptain-dev.tfplan"
) > "$RUN_DIR/plan.txt" 2>&1

(
  cd "$TF_ROOT"
  terraform apply -input=false -auto-approve "workcaptain-dev.tfplan"
) > "$RUN_DIR/apply.txt" 2>&1

# ─────────────────────────────────────────────────────────────────────────────
# VERIFY
# ─────────────────────────────────────────────────────────────────────────────
"$REPO_ROOT/scripts/workcaptain_gcp_nonprod_verify.sh" "$RUN_DIR" "$PROJECT_ID" "$REGION"

# ─────────────────────────────────────────────────────────────────────────────
# MANIFEST
# ─────────────────────────────────────────────────────────────────────────────
{
  echo "RUN_DIR=$RUN_DIR"
  echo "STATUS=PASS"
  echo "PHASE=WORKCAPTAIN-PHASE-2-GCP-NONPROD-ACTIVATION"
  echo "PROJECT_ID=$PROJECT_ID"
  echo "REGION=$REGION"
  echo "ENV=$ENV"
  echo "STATE_BUCKET=$STATE_BUCKET"
  echo "ARTIFACT_REGISTRY=$AR_REPO"
} > "$RUN_DIR/manifest.txt"

echo "ACTIVATION_RUN_DIR=$RUN_DIR"
echo "ACTIVATION_STATUS=PASS"
