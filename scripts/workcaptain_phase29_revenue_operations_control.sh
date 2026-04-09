#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BASELINE_COMMIT="${PHASE29_BASELINE_COMMIT:-}"
TS_OVERRIDE="${PHASE29_TS:-}"
EVIDENCE_DIR_OVERRIDE="${PHASE29_EVIDENCE_DIR:-}"

if [ -z "${BASELINE_COMMIT}" ]; then
  echo "MISSING_ENV: PHASE29_BASELINE_COMMIT"
  exit 1
fi

if [ -z "${TS_OVERRIDE}" ]; then
  TS_OVERRIDE="$(date -u +%Y%m%dT%H%M%SZ)"
fi

if [ -z "${EVIDENCE_DIR_OVERRIDE}" ]; then
  EVIDENCE_DIR_OVERRIDE="${ROOT_DIR}/evidence/phase29_${TS_OVERRIDE}"
fi

mkdir -p "${EVIDENCE_DIR_OVERRIDE}"

CURRENT_HEAD="$(git -C "${ROOT_DIR}" rev-parse HEAD)"
if [ "${CURRENT_HEAD}" != "${BASELINE_COMMIT}" ]; then
  echo "PHASE29_STATUS=blocked" | tee "${EVIDENCE_DIR_OVERRIDE}/decision.env"
  echo "BLOCK_REASON=baseline_commit_mismatch" | tee -a "${EVIDENCE_DIR_OVERRIDE}/decision.env"
  exit 1
fi

REQUIRED_PREREQS=(
  "${ROOT_DIR}/evidence/phase28_20260409T062435Z"
  "${ROOT_DIR}/FND/WORKCAPTAIN_COMMERCIAL_EXECUTION_COCKPIT_FRAMEWORK.md"
  "${ROOT_DIR}/FND/WORKCAPTAIN_ACTIVE_OPPORTUNITY_OPERATING_MODEL.md"
  "${ROOT_DIR}/FND/WORKCAPTAIN_OPPORTUNITY_RECORD_SCHEMA.md"
  "${ROOT_DIR}/FND/WORKCAPTAIN_PHASE26_STRICT_EVIDENCE_VALIDATION_RULE.md"
)

for p in "${REQUIRED_PREREQS[@]}"; do
  if [ ! -e "${p}" ]; then
    echo "PHASE29_STATUS=blocked" | tee "${EVIDENCE_DIR_OVERRIDE}/decision.env"
    echo "BLOCK_REASON=missing_prerequisite_artifact" | tee -a "${EVIDENCE_DIR_OVERRIDE}/decision.env"
    echo "MISSING_PATH=${p}" | tee -a "${EVIDENCE_DIR_OVERRIDE}/decision.env"
    exit 1
  fi
done

REQUIRED_PHASE29_FILES=(
  "${ROOT_DIR}/FND/WORKCAPTAIN_PHASE_29_REVENUE_OPERATIONS_CONTROL_LAYER_AND_ACTIVE_DEAL_GOVERNANCE_DASHBOARD.md"
  "${ROOT_DIR}/FND/WORKCAPTAIN_REVENUE_OPERATIONS_CONTROL_FRAMEWORK.md"
  "${ROOT_DIR}/FND/WORKCAPTAIN_ACTIVE_DEAL_GOVERNANCE_DASHBOARD_MODEL.md"
  "${ROOT_DIR}/FND/WORKCAPTAIN_GOVERNED_FORECAST_INPUT_MODEL.md"
  "${ROOT_DIR}/FND/WORKCAPTAIN_STAGE_WEIGHTING_AND_CONFIDENCE_MODEL.md"
  "${ROOT_DIR}/FND/WORKCAPTAIN_REVENUE_REVIEW_CADENCE.md"
  "${ROOT_DIR}/FND/WORKCAPTAIN_ACTIVE_DEAL_RISK_AND_BLOCKAGE_MODEL.md"
  "${ROOT_DIR}/FND/WORKCAPTAIN_DASHBOARD_EVIDENCE_DISCIPLINE.md"
  "${ROOT_DIR}/FND/WORKCAPTAIN_REVENUE_DECISION_AND_ESCALATION_WORKFLOW.md"
)

for f in "${REQUIRED_PHASE29_FILES[@]}"; do
  if [ ! -f "${f}" ]; then
    echo "PHASE29_STATUS=blocked" | tee "${EVIDENCE_DIR_OVERRIDE}/decision.env"
    echo "BLOCK_REASON=missing_required_phase29_file" | tee -a "${EVIDENCE_DIR_OVERRIDE}/decision.env"
    echo "MISSING_FILE=${f}" | tee -a "${EVIDENCE_DIR_OVERRIDE}/decision.env"
    exit 1
  fi
done

if [ -n "$(git -C "${ROOT_DIR}" status --porcelain)" ]; then
  echo "PHASE29_STATUS=blocked" | tee "${EVIDENCE_DIR_OVERRIDE}/decision.env"
  echo "BLOCK_REASON=working_tree_dirty_before_finalize" | tee -a "${EVIDENCE_DIR_OVERRIDE}/decision.env"
  exit 1
fi

cat > "${EVIDENCE_DIR_OVERRIDE}/phase29_summary.json" <<JSON
{
  "platform_identity": "WorkCaptain / ProWork",
  "phase": 29,
  "source_of_truth_commit": "${CURRENT_HEAD}",
  "phase29_timestamp_utc": "${TS_OVERRIDE}",
  "phase29_status": "ready",
  "revenue_operations_control_framework": true,
  "deal_governance_dashboard_model": true,
  "forecast_input_model": true,
  "stage_weighting_model": true,
  "review_cadence": true,
  "deal_risk_model": true,
  "dashboard_evidence_discipline": true,
  "revenue_escalation_workflow": true
}
JSON

cat > "${EVIDENCE_DIR_OVERRIDE}/revenue_dashboard_index.json" <<JSON
{
  "revenue_control_framework": "${ROOT_DIR}/FND/WORKCAPTAIN_REVENUE_OPERATIONS_CONTROL_FRAMEWORK.md",
  "deal_governance_dashboard": "${ROOT_DIR}/FND/WORKCAPTAIN_ACTIVE_DEAL_GOVERNANCE_DASHBOARD_MODEL.md",
  "forecast_input_model": "${ROOT_DIR}/FND/WORKCAPTAIN_GOVERNED_FORECAST_INPUT_MODEL.md",
  "stage_weighting_model": "${ROOT_DIR}/FND/WORKCAPTAIN_STAGE_WEIGHTING_AND_CONFIDENCE_MODEL.md",
  "review_cadence": "${ROOT_DIR}/FND/WORKCAPTAIN_REVENUE_REVIEW_CADENCE.md",
  "deal_risk_model": "${ROOT_DIR}/FND/WORKCAPTAIN_ACTIVE_DEAL_RISK_AND_BLOCKAGE_MODEL.md",
  "dashboard_evidence_discipline": "${ROOT_DIR}/FND/WORKCAPTAIN_DASHBOARD_EVIDENCE_DISCIPLINE.md",
  "revenue_escalation_workflow": "${ROOT_DIR}/FND/WORKCAPTAIN_REVENUE_DECISION_AND_ESCALATION_WORKFLOW.md"
}
JSON

(
  cd "${EVIDENCE_DIR_OVERRIDE}"
  shasum -a 256 phase29_summary.json revenue_dashboard_index.json > MANIFEST.sha256
)

echo "PHASE29_STATUS=ready" | tee "${EVIDENCE_DIR_OVERRIDE}/decision.env"
echo "REVENUE_CONTROL_FRAMEWORK_PATH=${ROOT_DIR}/FND/WORKCAPTAIN_REVENUE_OPERATIONS_CONTROL_FRAMEWORK.md" | tee -a "${EVIDENCE_DIR_OVERRIDE}/decision.env"
echo "DEAL_GOVERNANCE_DASHBOARD_PATH=${ROOT_DIR}/FND/WORKCAPTAIN_ACTIVE_DEAL_GOVERNANCE_DASHBOARD_MODEL.md" | tee -a "${EVIDENCE_DIR_OVERRIDE}/decision.env"
echo "FORECAST_INPUT_MODEL_PATH=${ROOT_DIR}/FND/WORKCAPTAIN_GOVERNED_FORECAST_INPUT_MODEL.md" | tee -a "${EVIDENCE_DIR_OVERRIDE}/decision.env"
echo "STAGE_WEIGHTING_MODEL_PATH=${ROOT_DIR}/FND/WORKCAPTAIN_STAGE_WEIGHTING_AND_CONFIDENCE_MODEL.md" | tee -a "${EVIDENCE_DIR_OVERRIDE}/decision.env"
echo "REVIEW_CADENCE_PATH=${ROOT_DIR}/FND/WORKCAPTAIN_REVENUE_REVIEW_CADENCE.md" | tee -a "${EVIDENCE_DIR_OVERRIDE}/decision.env"
echo "DEAL_RISK_MODEL_PATH=${ROOT_DIR}/FND/WORKCAPTAIN_ACTIVE_DEAL_RISK_AND_BLOCKAGE_MODEL.md" | tee -a "${EVIDENCE_DIR_OVERRIDE}/decision.env"
echo "DASHBOARD_EVIDENCE_DISCIPLINE_PATH=${ROOT_DIR}/FND/WORKCAPTAIN_DASHBOARD_EVIDENCE_DISCIPLINE.md" | tee -a "${EVIDENCE_DIR_OVERRIDE}/decision.env"
echo "REVENUE_ESCALATION_WORKFLOW_PATH=${ROOT_DIR}/FND/WORKCAPTAIN_REVENUE_DECISION_AND_ESCALATION_WORKFLOW.md" | tee -a "${EVIDENCE_DIR_OVERRIDE}/decision.env"

echo "PHASE29_COMPLETE"
echo "EVIDENCE_RUN_DIR=${EVIDENCE_DIR_OVERRIDE}"
echo "PHASE29_STATUS=ready"
