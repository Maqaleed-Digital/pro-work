#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="/opt/prowork"
TF_ROOT="$REPO_ROOT/infrastructure/gcp"
EVIDENCE_BASE="$REPO_ROOT/evidence/workcaptain/gcp-foundation-validation"

# ─────────────────────────────────────────────────────────────────────────────
# MODE: local | dev
# local — no backend, no real project required; validates structure only
# dev   — real WC_GCP_PROJECT_ID required; full provider-backed plan
# ─────────────────────────────────────────────────────────────────────────────
MODE="${WC_GCP_VALIDATION_MODE:-dev}"

if [ "$MODE" != "local" ] && [ "$MODE" != "dev" ]; then
  echo "ERROR: WC_GCP_VALIDATION_MODE must be 'local' or 'dev'. Got: $MODE"
  exit 1
fi

# ─────────────────────────────────────────────────────────────────────────────
# VARIABLE CONTRACT — dev mode requires real project ID; local uses placeholders
# ─────────────────────────────────────────────────────────────────────────────
if [ "$MODE" = "dev" ]; then
  required_env=(WC_GCP_PROJECT_ID WC_GCP_REGION WC_GCP_ENV WC_GCP_DB_TIER)
  for v in "${required_env[@]}"; do
    if [ -z "${!v:-}" ]; then
      echo "MISSING_REQUIRED_ENV=$v"
      exit 1
    fi
  done
  if [ "${WC_GCP_ENV:-}" != "dev" ]; then
    echo "ERROR: WC_GCP_ENV must be 'dev' for this phase."
    exit 1
  fi
  PROJECT_ID="$WC_GCP_PROJECT_ID"
  REGION="${WC_GCP_REGION:-me-central2}"
  ENV="${WC_GCP_ENV:-dev}"
  DB_TIER="${WC_GCP_DB_TIER:-db-custom-1-3840}"
else
  # local mode: use safe placeholder values
  PROJECT_ID="local-validation-placeholder"
  REGION="${WC_GCP_REGION:-me-central2}"
  ENV="dev"
  DB_TIER="${WC_GCP_DB_TIER:-db-custom-1-3840}"
fi

# ─────────────────────────────────────────────────────────────────────────────
# EVIDENCE DIR
# ─────────────────────────────────────────────────────────────────────────────
RUN_TS="$(date -u +"%Y%m%dT%H%M%SZ")"
RUN_DIR="$EVIDENCE_BASE/${MODE}-${RUN_TS}"
mkdir -p "$RUN_DIR"

{
  echo "MODE=$MODE"
  echo "WC_GCP_PROJECT_ID=$PROJECT_ID"
  echo "WC_GCP_REGION=$REGION"
  echo "WC_GCP_ENV=$ENV"
  echo "WC_GCP_DB_TIER=$DB_TIER"
} > "$RUN_DIR/env_contract.txt"

git -C "$REPO_ROOT" rev-parse HEAD > "$RUN_DIR/git_head.txt"
git -C "$REPO_ROOT" branch --show-current > "$RUN_DIR/branch.txt"

(terraform version || true) > "$RUN_DIR/terraform_version.txt" 2>&1
(gcloud version || true) > "$RUN_DIR/gcloud_version.txt" 2>&1

# ─────────────────────────────────────────────────────────────────────────────
# PREFLIGHT CHECKS
# ─────────────────────────────────────────────────────────────────────────────
if ! command -v terraform >/dev/null 2>&1; then
  echo "ERROR: terraform is not installed." | tee "$RUN_DIR/fmt.txt"
  exit 1
fi

for f in main.tf variables.tf outputs.tf; do
  if [ ! -f "$TF_ROOT/$f" ]; then
    echo "ERROR: Missing $TF_ROOT/$f"
    exit 1
  fi
done

# ─────────────────────────────────────────────────────────────────────────────
# WRITE TFVARS (safe in both modes — placeholder in local)
# ─────────────────────────────────────────────────────────────────────────────
mkdir -p "$TF_ROOT/env/dev"
cat > "$TF_ROOT/env/dev/dev.tfvars" <<VARS
project_id = "$PROJECT_ID"
region     = "$REGION"
env        = "$ENV"
db_tier    = "$DB_TIER"
VARS

# ─────────────────────────────────────────────────────────────────────────────
# FMT
# ─────────────────────────────────────────────────────────────────────────────
(
  cd "$TF_ROOT"
  terraform fmt -check -recursive
) > "$RUN_DIR/fmt.txt" 2>&1

# ─────────────────────────────────────────────────────────────────────────────
# INIT — local mode swaps GCS backend for local state via override file;
#        dev mode uses normal init against the real GCS backend
# ─────────────────────────────────────────────────────────────────────────────
LOCAL_BACKEND_OVERRIDE="$TF_ROOT/local_backend_override.tf"

cleanup_override() {
  rm -f "$LOCAL_BACKEND_OVERRIDE"
}

if [ "$MODE" = "local" ]; then
  # Write override file that replaces the GCS backend with a local one.
  # Terraform override files take precedence over the base config.
  cat > "$LOCAL_BACKEND_OVERRIDE" <<'TFOVERRIDE'
terraform {
  backend "local" {
    path = "/tmp/workcaptain-local-validation.tfstate"
  }
}
TFOVERRIDE
  trap cleanup_override EXIT
  (
    cd "$TF_ROOT"
    terraform init -input=false -reconfigure
  ) > "$RUN_DIR/init.txt" 2>&1
else
  (
    cd "$TF_ROOT"
    terraform init -input=false
  ) > "$RUN_DIR/init.txt" 2>&1
fi

# ─────────────────────────────────────────────────────────────────────────────
# VALIDATE
# ─────────────────────────────────────────────────────────────────────────────
(
  cd "$TF_ROOT"
  terraform validate
) > "$RUN_DIR/validate.txt" 2>&1

# ─────────────────────────────────────────────────────────────────────────────
# PLAN — no -out in local mode (no backend to store it against)
# ─────────────────────────────────────────────────────────────────────────────
if [ "$MODE" = "local" ]; then
  (
    cd "$TF_ROOT"
    terraform plan -input=false -var-file="env/dev/dev.tfvars"
  ) > "$RUN_DIR/plan.txt" 2>&1
else
  (
    cd "$TF_ROOT"
    terraform plan -input=false -var-file="env/dev/dev.tfvars" -out="workcaptain-dev.tfplan"
  ) > "$RUN_DIR/plan.txt" 2>&1
fi

# ─────────────────────────────────────────────────────────────────────────────
# OPTIONAL ARTIFACTS
# ─────────────────────────────────────────────────────────────────────────────
if [ -f "$REPO_ROOT/scripts/deploy.sh" ]; then
  sed -n '1,20p' "$REPO_ROOT/scripts/deploy.sh" > "$RUN_DIR/deploy_script_head.txt"
fi

(
  cd "$TF_ROOT"
  terraform output -json || true
) > "$RUN_DIR/outputs_preview.txt" 2>&1

# ─────────────────────────────────────────────────────────────────────────────
# MANIFEST
# ─────────────────────────────────────────────────────────────────────────────
{
  echo "RUN_DIR=$RUN_DIR"
  echo "STATUS=PASS"
  echo "MODE=$MODE"
  echo "PHASE=WORKCAPTAIN-PHASE-1-GCP-FOUNDATION-VALIDATION"
  echo "ENV=$ENV"
  echo "PROJECT_ID=$PROJECT_ID"
  echo "REGION=$REGION"
} > "$RUN_DIR/manifest.txt"

echo "VALIDATION_RUN_DIR=$RUN_DIR"
echo "VALIDATION_STATUS=PASS"
echo "VALIDATION_MODE=$MODE"
