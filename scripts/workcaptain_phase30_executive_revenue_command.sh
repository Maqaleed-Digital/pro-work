#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BASELINE_COMMIT="${PHASE30_BASELINE_COMMIT:-}"
TS_OVERRIDE="${PHASE30_TS:-}"
EVIDENCE_DIR_OVERRIDE="${PHASE30_EVIDENCE_DIR:-}"

if [ -z "${BASELINE_COMMIT}" ]; then
  echo "MISSING_ENV: PHASE30_BASELINE_COMMIT"
  exit 1
fi

if [ -z "${TS_OVERRIDE}" ]; then
  TS_OVERRIDE="$(date -u +%Y%m%dT%H%M%SZ)"
fi

if [ -z "${EVIDENCE_DIR_OVERRIDE}" ]; then
  EVIDENCE_DIR_OVERRIDE="${ROOT_DIR}/evidence/phase30_${TS_OVERRIDE}"
fi

mkdir -p "${EVIDENCE_DIR_OVERRIDE}"

CURRENT_HEAD="$(git -C "${ROOT_DIR}" rev-parse HEAD)"
if [ "${CURRENT_HEAD}" != "${BASELINE_COMMIT}" ]; then
  echo "PHASE30_STATUS=blocked" | tee "${EVIDENCE_DIR_OVERRIDE}/decision.env"
  echo "BLOCK_REASON=baseline_commit_mismatch" | tee -a "${EVIDENCE_DIR_OVERRIDE}/decision.env"
  exit 1
fi

REQUIRED_PREREQS=(
  "${ROOT_DIR}/evidence/phase29_20260409T064144Z"
  "${ROOT_DIR}/FND/WORKCAPTAIN_REVENUE_OPERATIONS_CONTROL_FRAMEWORK.md"
  "${ROOT_DIR}/FND/WORKCAPTAIN_ACTIVE_DEAL_GOVERNANCE_DASHBOARD_MODEL.md"
  "${ROOT_DIR}/FND/WORKCAPTAIN_GOVERNED_FORECAST_INPUT_MODEL.md"
  "${ROOT_DIR}/FND/WORKCAPTAIN_PHASE26_STRICT_EVIDENCE_VALIDATION_RULE.md"
)

for p in "${REQUIRED_PREREQS[@]}"; do
  if [ ! -e "${p}" ]; then
    echo "PHASE30_STATUS=blocked" | tee "${EVIDENCE_DIR_OVERRIDE}/decision.env"
    echo "BLOCK_REASON=missing_prerequisite_artifact" | tee -a "${EVIDENCE_DIR_OVERRIDE}/decision.env"
    echo "MISSING_PATH=${p}" | tee -a "${EVIDENCE_DIR_OVERRIDE}/decision.env"
    exit 1
  fi
done

REQUIRED_PHASE30_FILES=(
  "${ROOT_DIR}/FND/WORKCAPTAIN_PHASE_30_EXECUTIVE_REVENUE_COMMAND_LAYER_AND_PORTFOLIO_CONVERSION_GOVERNANCE_SYSTEM.md"
  "${ROOT_DIR}/FND/WORKCAPTAIN_EXECUTIVE_REVENUE_COMMAND_FRAMEWORK.md"
  "${ROOT_DIR}/FND/WORKCAPTAIN_PORTFOLIO_CONVERSION_GOVERNANCE_MODEL.md"
  "${ROOT_DIR}/FND/WORKCAPTAIN_EXECUTIVE_COMMAND_DASHBOARD_MODEL.md"
  "${ROOT_DIR}/FND/WORKCAPTAIN_CONVERSION_STAGE_GOVERNANCE_MODEL.md"
  "${ROOT_DIR}/FND/WORKCAPTAIN_PORTFOLIO_CONCENTRATION_AND_DEPENDENCY_MODEL.md"
  "${ROOT_DIR}/FND/WORKCAPTAIN_EXECUTIVE_REVIEW_AND_INTERVENTION_CADENCE.md"
  "${ROOT_DIR}/FND/WORKCAPTAIN_PORTFOLIO_EVIDENCE_DISCIPLINE.md"
  "${ROOT_DIR}/FND/WORKCAPTAIN_EXECUTIVE_CONVERSION_DECISION_WORKFLOW.md"
)

for f in "${REQUIRED_PHASE30_FILES[@]}"; do
  if [ ! -f "${f}" ]; then
    echo "PHASE30_STATUS=blocked" | tee "${EVIDENCE_DIR_OVERRIDE}/decision.env"
    echo "BLOCK_REASON=missing_required_phase30_file" | tee -a "${EVIDENCE_DIR_OVERRIDE}/decision.env"
    echo "MISSING_FILE=${f}" | tee -a "${EVIDENCE_DIR_OVERRIDE}/decision.env"
    exit 1
  fi
done

if [ -n "$(git -C "${ROOT_DIR}" status --porcelain)" ]; then
  echo "PHASE30_STATUS=blocked" | tee "${EVIDENCE_DIR_OVERRIDE}/decision.env"
  echo "BLOCK_REASON=working_tree_dirty_before_finalize" | tee -a "${EVIDENCE_DIR_OVERRIDE}/decision.env"
  exit 1
fi

cat > "${EVIDENCE_DIR_OVERRIDE}/phase30_summary.json" <<JSON
{
  "platform_identity": "WorkCaptain / ProWork",
  "phase": 30,
  "source_of_truth_commit": "${CURRENT_HEAD}",
  "phase30_timestamp_utc": "${TS_OVERRIDE}",
  "phase30_status": "ready",
  "executive_command_framework": true,
  "portfolio_conversion_governance_model": true,
  "executive_dashboard_model": true,
  "conversion_stage_model": true,
  "concentration_dependency_model": true,
  "executive_review_cadence": true,
  "portfolio_evidence_discipline": true,
  "executive_decision_workflow": true
}
JSON

cat > "${EVIDENCE_DIR_OVERRIDE}/executive_portfolio_index.json" <<JSON
{
  "executive_command_framework": "${ROOT_DIR}/FND/WORKCAPTAIN_EXECUTIVE_REVENUE_COMMAND_FRAMEWORK.md",
  "portfolio_conversion_model": "${ROOT_DIR}/FND/WORKCAPTAIN_PORTFOLIO_CONVERSION_GOVERNANCE_MODEL.md",
  "executive_dashboard_model": "${ROOT_DIR}/FND/WORKCAPTAIN_EXECUTIVE_COMMAND_DASHBOARD_MODEL.md",
  "conversion_stage_model": "${ROOT_DIR}/FND/WORKCAPTAIN_CONVERSION_STAGE_GOVERNANCE_MODEL.md",
  "concentration_dependency_model": "${ROOT_DIR}/FND/WORKCAPTAIN_PORTFOLIO_CONCENTRATION_AND_DEPENDENCY_MODEL.md",
  "executive_review_cadence": "${ROOT_DIR}/FND/WORKCAPTAIN_EXECUTIVE_REVIEW_AND_INTERVENTION_CADENCE.md",
  "portfolio_evidence_discipline": "${ROOT_DIR}/FND/WORKCAPTAIN_PORTFOLIO_EVIDENCE_DISCIPLINE.md",
  "executive_decision_workflow": "${ROOT_DIR}/FND/WORKCAPTAIN_EXECUTIVE_CONVERSION_DECISION_WORKFLOW.md"
}
JSON

(
  cd "${EVIDENCE_DIR_OVERRIDE}"
  shasum -a 256 phase30_summary.json executive_portfolio_index.json > MANIFEST.sha256
)

echo "PHASE30_STATUS=ready" | tee "${EVIDENCE_DIR_OVERRIDE}/decision.env"
echo "EXECUTIVE_COMMAND_FRAMEWORK_PATH=${ROOT_DIR}/FND/WORKCAPTAIN_EXECUTIVE_REVENUE_COMMAND_FRAMEWORK.md" | tee -a "${EVIDENCE_DIR_OVERRIDE}/decision.env"
echo "PORTFOLIO_CONVERSION_MODEL_PATH=${ROOT_DIR}/FND/WORKCAPTAIN_PORTFOLIO_CONVERSION_GOVERNANCE_MODEL.md" | tee -a "${EVIDENCE_DIR_OVERRIDE}/decision.env"
echo "EXECUTIVE_DASHBOARD_MODEL_PATH=${ROOT_DIR}/FND/WORKCAPTAIN_EXECUTIVE_COMMAND_DASHBOARD_MODEL.md" | tee -a "${EVIDENCE_DIR_OVERRIDE}/decision.env"
echo "CONVERSION_STAGE_MODEL_PATH=${ROOT_DIR}/FND/WORKCAPTAIN_CONVERSION_STAGE_GOVERNANCE_MODEL.md" | tee -a "${EVIDENCE_DIR_OVERRIDE}/decision.env"
echo "CONCENTRATION_DEPENDENCY_MODEL_PATH=${ROOT_DIR}/FND/WORKCAPTAIN_PORTFOLIO_CONCENTRATION_AND_DEPENDENCY_MODEL.md" | tee -a "${EVIDENCE_DIR_OVERRIDE}/decision.env"
echo "EXECUTIVE_REVIEW_CADENCE_PATH=${ROOT_DIR}/FND/WORKCAPTAIN_EXECUTIVE_REVIEW_AND_INTERVENTION_CADENCE.md" | tee -a "${EVIDENCE_DIR_OVERRIDE}/decision.env"
echo "PORTFOLIO_EVIDENCE_DISCIPLINE_PATH=${ROOT_DIR}/FND/WORKCAPTAIN_PORTFOLIO_EVIDENCE_DISCIPLINE.md" | tee -a "${EVIDENCE_DIR_OVERRIDE}/decision.env"
echo "EXECUTIVE_DECISION_WORKFLOW_PATH=${ROOT_DIR}/FND/WORKCAPTAIN_EXECUTIVE_CONVERSION_DECISION_WORKFLOW.md" | tee -a "${EVIDENCE_DIR_OVERRIDE}/decision.env"

echo "PHASE30_COMPLETE"
echo "EVIDENCE_RUN_DIR=${EVIDENCE_DIR_OVERRIDE}"
echo "PHASE30_STATUS=ready"
