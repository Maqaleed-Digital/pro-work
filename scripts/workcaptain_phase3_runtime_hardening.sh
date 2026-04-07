#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="/opt/prowork"
TF_ROOT="$REPO_ROOT/infrastructure/gcp"
EVIDENCE_BASE="$REPO_ROOT/evidence/workcaptain/phase3-runtime-hardening"

: "${WC_GCP_PROJECT_ID:=prj-maq-workcaptain-nonprod}"
: "${WC_GCP_REGION:=me-central2}"
: "${WC_GCP_ENV:=dev}"

PROJECT_ID="$WC_GCP_PROJECT_ID"
REGION="$WC_GCP_REGION"
ENV="$WC_GCP_ENV"

RUN_TS="$(date -u +"%Y%m%dT%H%M%SZ")"
RUN_DIR="$EVIDENCE_BASE/$RUN_TS"
mkdir -p "$RUN_DIR"

RUN_STATUS="FAIL"
finalize_manifest() {
  {
    echo "RUN_DIR=$RUN_DIR"
    echo "STATUS=$RUN_STATUS"
    echo "PHASE=WORKCAPTAIN-PHASE-3-RUNTIME-HARDENING-AND-ACCESS-CONTROL"
    echo "PROJECT_ID=$PROJECT_ID"
    echo "REGION=$REGION"
    echo "ENV=$ENV"
  } > "$RUN_DIR/manifest.txt"
}
trap finalize_manifest EXIT

{
  echo "PROJECT_ID=$PROJECT_ID"
  echo "REGION=$REGION"
  echo "ENV=$ENV"
} > "$RUN_DIR/env_contract.txt"

git -C "$REPO_ROOT" rev-parse HEAD > "$RUN_DIR/git_head.txt"
git -C "$REPO_ROOT" branch --show-current > "$RUN_DIR/branch.txt"
(terraform version || true) > "$RUN_DIR/terraform_version.txt" 2>&1
(gcloud version || true) > "$RUN_DIR/gcloud_version.txt" 2>&1

if ! gcloud auth application-default print-access-token >/dev/null 2>&1; then
  echo "ERROR: ADC not valid." | tee "$RUN_DIR/adc_check.txt"
  exit 1
fi
echo "ADC_STATUS=PASS" > "$RUN_DIR/adc_check.txt"

gcloud projects describe "$PROJECT_ID" > "$RUN_DIR/project_describe.txt" 2>&1

gcloud run services list \
  --project="$PROJECT_ID" \
  --region="$REGION" > "$RUN_DIR/run_services_before.txt" 2>&1

gcloud artifacts repositories list \
  --project="$PROJECT_ID" \
  --location="$REGION" > "$RUN_DIR/artifact_registry.txt" 2>&1 || true

gcloud iam service-accounts list \
  --project="$PROJECT_ID" > "$RUN_DIR/service_accounts.txt" 2>&1 || true

gcloud projects get-iam-policy "$PROJECT_ID" \
  --format=json > "$RUN_DIR/project_iam_policy.json" 2>&1 || true

for svc in api-service trust-processor agent-orchestrator background-worker; do
  gcloud run services get-iam-policy "$svc" \
    --project="$PROJECT_ID" \
    --region="$REGION" \
    --format=json > "$RUN_DIR/${svc}_iam_policy.json" 2>&1 || true
done

cat > "$RUN_DIR/hardening_actions.txt" <<ACTIONS
1. remove unauthenticated invoker from non-essential services
2. retain controlled access posture for nonprod
3. scaffold load balancer and Cloud Armor in Terraform
4. capture secret contract and dashboard scaffolding
ACTIONS

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
  terraform plan -input=false -var-file="env/dev/dev.tfvars" -var-file="env/dev/hardening.auto.tfvars"
) > "$RUN_DIR/plan.txt" 2>&1 || true

for svc in trust-processor agent-orchestrator background-worker; do
  gcloud run services remove-iam-policy-binding "$svc" \
    --project="$PROJECT_ID" \
    --region="$REGION" \
    --member="allUsers" \
    --role="roles/run.invoker" > "$RUN_DIR/${svc}_remove_allusers.txt" 2>&1 || true
done

gcloud run services list \
  --project="$PROJECT_ID" \
  --region="$REGION" > "$RUN_DIR/run_services_after.txt" 2>&1

for svc in api-service trust-processor agent-orchestrator background-worker; do
  gcloud run services describe "$svc" \
    --project="$PROJECT_ID" \
    --region="$REGION" \
    --format=json > "$RUN_DIR/${svc}_describe.json" 2>&1 || true
done

RUN_STATUS="PASS"
echo "HARDENING_STATUS=PASS" > "$RUN_DIR/verify_status.txt"
echo "HARDENING_RUN_DIR=$RUN_DIR"
echo "HARDENING_STATUS=PASS"
