#!/usr/bin/env bash
# WORKCAPTAIN / PROWORK — PHASE 27: Live Deal Activation + Pipeline Execution System
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BASELINE_COMMIT="${PHASE27_BASELINE_COMMIT:-}"
TS_OVERRIDE="${PHASE27_TS:-}"
EVIDENCE_DIR_OVERRIDE="${PHASE27_EVIDENCE_DIR:-}"

if [ -z "${BASELINE_COMMIT}" ]; then
  echo "MISSING_ENV: PHASE27_BASELINE_COMMIT"
  exit 1
fi

if [ -z "${TS_OVERRIDE}" ]; then
  TS_OVERRIDE="$(date -u +%Y%m%dT%H%M%SZ)"
fi

if [ -z "${EVIDENCE_DIR_OVERRIDE}" ]; then
  EVIDENCE_DIR_OVERRIDE="${ROOT_DIR}/evidence/phase27_${TS_OVERRIDE}"
fi

mkdir -p "${EVIDENCE_DIR_OVERRIDE}"

# ---------------------------------------------------------------------------
# Gate 1: source-of-truth commit
# ---------------------------------------------------------------------------
CURRENT_HEAD="$(git -C "${ROOT_DIR}" rev-parse HEAD)"
if [ "${CURRENT_HEAD}" != "${BASELINE_COMMIT}" ]; then
  echo "PHASE27_STATUS=blocked" | tee "${EVIDENCE_DIR_OVERRIDE}/decision.env"
  echo "BLOCK_REASON=baseline_commit_mismatch" | tee -a "${EVIDENCE_DIR_OVERRIDE}/decision.env"
  echo "EXPECTED=${BASELINE_COMMIT}" | tee -a "${EVIDENCE_DIR_OVERRIDE}/decision.env"
  echo "ACTUAL=${CURRENT_HEAD}" | tee -a "${EVIDENCE_DIR_OVERRIDE}/decision.env"
  exit 1
fi

# ---------------------------------------------------------------------------
# Gate 2: prerequisite artifacts (phases 24-26)
# ---------------------------------------------------------------------------
REQUIRED_PREREQS=(
  "${ROOT_DIR}/FND/WORKCAPTAIN_BOARD_READINESS_CERTIFICATION_PACK.md"
  "${ROOT_DIR}/FND/WORKCAPTAIN_ENTERPRISE_CLIENT_ASSURANCE_PROFILE.md"
  "${ROOT_DIR}/FND/WORKCAPTAIN_SOVEREIGN_REGULATORY_POSITIONING_DECLARATION.md"
  "${ROOT_DIR}/FND/WORKCAPTAIN_EXTERNAL_ASSURANCE_OPERATIONS_PROTOCOL.md"
  "${ROOT_DIR}/FND/WORKCAPTAIN_ASSURANCE_DISCLOSURE_BOUNDARY.md"
  "${ROOT_DIR}/FND/WORKCAPTAIN_PRESENTATION_TRACEABILITY_MAP.md"
)

for p in "${REQUIRED_PREREQS[@]}"; do
  if [ ! -e "${p}" ]; then
    echo "PHASE27_STATUS=blocked" | tee "${EVIDENCE_DIR_OVERRIDE}/decision.env"
    echo "BLOCK_REASON=missing_prerequisite_artifact" | tee -a "${EVIDENCE_DIR_OVERRIDE}/decision.env"
    echo "MISSING_PATH=${p}" | tee -a "${EVIDENCE_DIR_OVERRIDE}/decision.env"
    exit 1
  fi
done

# ---------------------------------------------------------------------------
# Gate 3: Phase 27 artifacts
# ---------------------------------------------------------------------------
REQUIRED_PHASE27_FILES=(
  "${ROOT_DIR}/FND/WORKCAPTAIN_PHASE_27_LIVE_DEAL_ACTIVATION_AND_PIPELINE_EXECUTION_SYSTEM.md"
  "${ROOT_DIR}/FND/WORKCAPTAIN_LIVE_DEAL_ACTIVATION_FRAMEWORK.md"
  "${ROOT_DIR}/FND/WORKCAPTAIN_PIPELINE_STAGE_MODEL.md"
  "${ROOT_DIR}/FND/WORKCAPTAIN_DEAL_QUALIFICATION_PROTOCOL.md"
  "${ROOT_DIR}/FND/WORKCAPTAIN_INVESTOR_PURSUIT_PLAYBOOK.md"
  "${ROOT_DIR}/FND/WORKCAPTAIN_ENTERPRISE_PILOT_PURSUIT_PLAYBOOK.md"
  "${ROOT_DIR}/FND/WORKCAPTAIN_SOVEREIGN_STRATEGIC_PARTNER_PURSUIT_PLAYBOOK.md"
  "${ROOT_DIR}/FND/WORKCAPTAIN_LIVE_DILIGENCE_EXECUTION_WORKFLOW.md"
  "${ROOT_DIR}/FND/WORKCAPTAIN_DEAL_EVIDENCE_AND_TRACEABILITY_MODEL.md"
  "${ROOT_DIR}/FND/WORKCAPTAIN_DEAL_DECISION_AND_ESCALATION_MODEL.md"
)

for f in "${REQUIRED_PHASE27_FILES[@]}"; do
  if [ ! -f "${f}" ]; then
    echo "PHASE27_STATUS=blocked" | tee "${EVIDENCE_DIR_OVERRIDE}/decision.env"
    echo "BLOCK_REASON=missing_required_phase27_file" | tee -a "${EVIDENCE_DIR_OVERRIDE}/decision.env"
    echo "MISSING_FILE=${f}" | tee -a "${EVIDENCE_DIR_OVERRIDE}/decision.env"
    exit 1
  fi
done

# ---------------------------------------------------------------------------
# Gate 4: clean working tree
# ---------------------------------------------------------------------------
if [ -n "$(git -C "${ROOT_DIR}" status --porcelain)" ]; then
  echo "PHASE27_STATUS=blocked" | tee "${EVIDENCE_DIR_OVERRIDE}/decision.env"
  echo "BLOCK_REASON=working_tree_dirty_before_finalize" | tee -a "${EVIDENCE_DIR_OVERRIDE}/decision.env"
  git -C "${ROOT_DIR}" status --short | tee -a "${EVIDENCE_DIR_OVERRIDE}/decision.env"
  exit 1
fi

# ---------------------------------------------------------------------------
# All gates passed — generate evidence artifacts
# ---------------------------------------------------------------------------
cat > "${EVIDENCE_DIR_OVERRIDE}/phase27_summary.json" <<JSON
{
  "platform_identity": "WorkCaptain / ProWork",
  "phase": 27,
  "source_of_truth_commit": "${CURRENT_HEAD}",
  "phase27_timestamp_utc": "${TS_OVERRIDE}",
  "phase27_status": "ready",
  "live_deal_activation_framework": true,
  "pipeline_stage_model": true,
  "qualification_protocol": true,
  "investor_playbook": true,
  "enterprise_playbook": true,
  "sovereign_playbook": true,
  "live_diligence_workflow": true,
  "deal_traceability_model": true,
  "deal_escalation_model": true
}
JSON

cat > "${EVIDENCE_DIR_OVERRIDE}/pipeline_index.json" <<JSON
{
  "live_deal_framework": "${ROOT_DIR}/FND/WORKCAPTAIN_LIVE_DEAL_ACTIVATION_FRAMEWORK.md",
  "pipeline_stage_model": "${ROOT_DIR}/FND/WORKCAPTAIN_PIPELINE_STAGE_MODEL.md",
  "qualification_protocol": "${ROOT_DIR}/FND/WORKCAPTAIN_DEAL_QUALIFICATION_PROTOCOL.md",
  "investor_playbook": "${ROOT_DIR}/FND/WORKCAPTAIN_INVESTOR_PURSUIT_PLAYBOOK.md",
  "enterprise_playbook": "${ROOT_DIR}/FND/WORKCAPTAIN_ENTERPRISE_PILOT_PURSUIT_PLAYBOOK.md",
  "sovereign_playbook": "${ROOT_DIR}/FND/WORKCAPTAIN_SOVEREIGN_STRATEGIC_PARTNER_PURSUIT_PLAYBOOK.md",
  "live_diligence_workflow": "${ROOT_DIR}/FND/WORKCAPTAIN_LIVE_DILIGENCE_EXECUTION_WORKFLOW.md",
  "deal_traceability_model": "${ROOT_DIR}/FND/WORKCAPTAIN_DEAL_EVIDENCE_AND_TRACEABILITY_MODEL.md",
  "deal_escalation_model": "${ROOT_DIR}/FND/WORKCAPTAIN_DEAL_DECISION_AND_ESCALATION_MODEL.md"
}
JSON

(
  cd "${EVIDENCE_DIR_OVERRIDE}"
  shasum -a 256 phase27_summary.json pipeline_index.json > MANIFEST.sha256
)

{
  echo "PHASE27_STATUS=ready"
  echo "LIVE_DEAL_FRAMEWORK_PATH=${ROOT_DIR}/FND/WORKCAPTAIN_LIVE_DEAL_ACTIVATION_FRAMEWORK.md"
  echo "PIPELINE_STAGE_MODEL_PATH=${ROOT_DIR}/FND/WORKCAPTAIN_PIPELINE_STAGE_MODEL.md"
  echo "QUALIFICATION_PROTOCOL_PATH=${ROOT_DIR}/FND/WORKCAPTAIN_DEAL_QUALIFICATION_PROTOCOL.md"
  echo "INVESTOR_PLAYBOOK_PATH=${ROOT_DIR}/FND/WORKCAPTAIN_INVESTOR_PURSUIT_PLAYBOOK.md"
  echo "ENTERPRISE_PLAYBOOK_PATH=${ROOT_DIR}/FND/WORKCAPTAIN_ENTERPRISE_PILOT_PURSUIT_PLAYBOOK.md"
  echo "SOVEREIGN_PLAYBOOK_PATH=${ROOT_DIR}/FND/WORKCAPTAIN_SOVEREIGN_STRATEGIC_PARTNER_PURSUIT_PLAYBOOK.md"
  echo "LIVE_DILIGENCE_WORKFLOW_PATH=${ROOT_DIR}/FND/WORKCAPTAIN_LIVE_DILIGENCE_EXECUTION_WORKFLOW.md"
  echo "DEAL_TRACEABILITY_MODEL_PATH=${ROOT_DIR}/FND/WORKCAPTAIN_DEAL_EVIDENCE_AND_TRACEABILITY_MODEL.md"
  echo "DEAL_ESCALATION_MODEL_PATH=${ROOT_DIR}/FND/WORKCAPTAIN_DEAL_DECISION_AND_ESCALATION_MODEL.md"
} | tee "${EVIDENCE_DIR_OVERRIDE}/decision.env"

echo ""
echo "PHASE27_COMPLETE"
echo "EVIDENCE_RUN_DIR=${EVIDENCE_DIR_OVERRIDE}"
echo "PHASE27_STATUS=ready"
