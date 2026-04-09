#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BASELINE_COMMIT="${PHASE28_BASELINE_COMMIT:-}"
TS_OVERRIDE="${PHASE28_TS:-}"
EVIDENCE_DIR_OVERRIDE="${PHASE28_EVIDENCE_DIR:-}"

if [ -z "${BASELINE_COMMIT}" ]; then
  echo "MISSING_ENV: PHASE28_BASELINE_COMMIT"
  exit 1
fi

if [ -z "${TS_OVERRIDE}" ]; then
  TS_OVERRIDE="$(date -u +%Y%m%dT%H%M%SZ)"
fi

if [ -z "${EVIDENCE_DIR_OVERRIDE}" ]; then
  EVIDENCE_DIR_OVERRIDE="${ROOT_DIR}/evidence/phase28_${TS_OVERRIDE}"
fi

mkdir -p "${EVIDENCE_DIR_OVERRIDE}"

CURRENT_HEAD="$(git -C "${ROOT_DIR}" rev-parse HEAD)"
if [ "${CURRENT_HEAD}" != "${BASELINE_COMMIT}" ]; then
  echo "PHASE28_STATUS=blocked" | tee "${EVIDENCE_DIR_OVERRIDE}/decision.env"
  echo "BLOCK_REASON=baseline_commit_mismatch" | tee -a "${EVIDENCE_DIR_OVERRIDE}/decision.env"
  exit 1
fi

resolve_phase26_evidence_dir() {
  find "${ROOT_DIR}/evidence" -maxdepth 1 -type d -name 'phase26_*' | LC_ALL=C sort | while read -r dir; do
    case "${dir}" in
      *'${PHASE26_TS}'*) continue ;;
    esac
    if [ -f "${dir}/MANIFEST.sha256" ] && [ -f "${dir}/phase27_summary.json" ]; then
      continue
    fi
    if [ -f "${dir}/MANIFEST.sha256" ]; then
      echo "${dir}"
      return 0
    fi
  done
  return 1
}

PHASE26_RESOLVED_DIR="$(resolve_phase26_evidence_dir || true)"

if [ -z "${PHASE26_RESOLVED_DIR}" ]; then
  echo "PHASE28_STATUS=blocked" | tee "${EVIDENCE_DIR_OVERRIDE}/decision.env"
  echo "BLOCK_REASON=phase26_evidence_not_resolved_and_hashed" | tee -a "${EVIDENCE_DIR_OVERRIDE}/decision.env"
  exit 1
fi

case "${PHASE26_RESOLVED_DIR}" in
  *'${PHASE26_TS}'*|*'${'*)
    echo "PHASE28_STATUS=blocked" | tee "${EVIDENCE_DIR_OVERRIDE}/decision.env"
    echo "BLOCK_REASON=phase26_evidence_contains_placeholder" | tee -a "${EVIDENCE_DIR_OVERRIDE}/decision.env"
    echo "RESOLVED_PHASE26_EVIDENCE_DIR=${PHASE26_RESOLVED_DIR}" | tee -a "${EVIDENCE_DIR_OVERRIDE}/decision.env"
    exit 1
    ;;
esac

if [ ! -f "${PHASE26_RESOLVED_DIR}/MANIFEST.sha256" ]; then
  echo "PHASE28_STATUS=blocked" | tee "${EVIDENCE_DIR_OVERRIDE}/decision.env"
  echo "BLOCK_REASON=phase26_manifest_missing" | tee -a "${EVIDENCE_DIR_OVERRIDE}/decision.env"
  echo "RESOLVED_PHASE26_EVIDENCE_DIR=${PHASE26_RESOLVED_DIR}" | tee -a "${EVIDENCE_DIR_OVERRIDE}/decision.env"
  exit 1
fi

REQUIRED_PREREQS=(
  "${ROOT_DIR}/FND/WORKCAPTAIN_BOARD_READINESS_CERTIFICATION_PACK.md"
  "${ROOT_DIR}/FND/WORKCAPTAIN_ENTERPRISE_CLIENT_ASSURANCE_PROFILE.md"
  "${ROOT_DIR}/FND/WORKCAPTAIN_SOVEREIGN_REGULATORY_POSITIONING_DECLARATION.md"
  "${ROOT_DIR}/FND/WORKCAPTAIN_EXTERNAL_ASSURANCE_OPERATIONS_PROTOCOL.md"
  "${ROOT_DIR}/FND/WORKCAPTAIN_ASSURANCE_DISCLOSURE_BOUNDARY.md"
  "${ROOT_DIR}/FND/WORKCAPTAIN_PRESENTATION_TRACEABILITY_MAP.md"
  "${ROOT_DIR}/FND/WORKCAPTAIN_LIVE_DEAL_ACTIVATION_FRAMEWORK.md"
  "${ROOT_DIR}/evidence/phase27_20260409T055614Z"
)

for p in "${REQUIRED_PREREQS[@]}"; do
  if [ ! -e "${p}" ]; then
    echo "PHASE28_STATUS=blocked" | tee "${EVIDENCE_DIR_OVERRIDE}/decision.env"
    echo "BLOCK_REASON=missing_prerequisite_artifact" | tee -a "${EVIDENCE_DIR_OVERRIDE}/decision.env"
    echo "MISSING_PATH=${p}" | tee -a "${EVIDENCE_DIR_OVERRIDE}/decision.env"
    echo "RESOLVED_PHASE26_EVIDENCE_DIR=${PHASE26_RESOLVED_DIR}" | tee -a "${EVIDENCE_DIR_OVERRIDE}/decision.env"
    exit 1
  fi
done

REQUIRED_PHASE28_FILES=(
  "${ROOT_DIR}/FND/WORKCAPTAIN_PHASE_28_COMMERCIAL_EXECUTION_COCKPIT_AND_ACTIVE_OPPORTUNITY_OPERATING_SYSTEM.md"
  "${ROOT_DIR}/FND/WORKCAPTAIN_COMMERCIAL_EXECUTION_COCKPIT_FRAMEWORK.md"
  "${ROOT_DIR}/FND/WORKCAPTAIN_ACTIVE_OPPORTUNITY_OPERATING_MODEL.md"
  "${ROOT_DIR}/FND/WORKCAPTAIN_OPPORTUNITY_RECORD_SCHEMA.md"
  "${ROOT_DIR}/FND/WORKCAPTAIN_OPPORTUNITY_REVIEW_CADENCE_MODEL.md"
  "${ROOT_DIR}/FND/WORKCAPTAIN_PURSUIT_CHANNEL_OPERATING_MODEL.md"
  "${ROOT_DIR}/FND/WORKCAPTAIN_COMMERCIAL_HEALTH_AND_MOMENTUM_MODEL.md"
  "${ROOT_DIR}/FND/WORKCAPTAIN_OPPORTUNITY_EVIDENCE_DISCIPLINE.md"
  "${ROOT_DIR}/FND/WORKCAPTAIN_ACTIVE_PIPELINE_DECISION_WORKFLOW.md"
  "${ROOT_DIR}/FND/WORKCAPTAIN_PHASE26_STRICT_EVIDENCE_VALIDATION_RULE.md"
)

for f in "${REQUIRED_PHASE28_FILES[@]}"; do
  if [ ! -f "${f}" ]; then
    echo "PHASE28_STATUS=blocked" | tee "${EVIDENCE_DIR_OVERRIDE}/decision.env"
    echo "BLOCK_REASON=missing_required_phase28_file" | tee -a "${EVIDENCE_DIR_OVERRIDE}/decision.env"
    echo "MISSING_FILE=${f}" | tee -a "${EVIDENCE_DIR_OVERRIDE}/decision.env"
    echo "RESOLVED_PHASE26_EVIDENCE_DIR=${PHASE26_RESOLVED_DIR}" | tee -a "${EVIDENCE_DIR_OVERRIDE}/decision.env"
    exit 1
  fi
done

if [ -n "$(git -C "${ROOT_DIR}" status --porcelain)" ]; then
  echo "PHASE28_STATUS=blocked" | tee "${EVIDENCE_DIR_OVERRIDE}/decision.env"
  echo "BLOCK_REASON=working_tree_dirty_before_finalize" | tee -a "${EVIDENCE_DIR_OVERRIDE}/decision.env"
  echo "RESOLVED_PHASE26_EVIDENCE_DIR=${PHASE26_RESOLVED_DIR}" | tee -a "${EVIDENCE_DIR_OVERRIDE}/decision.env"
  exit 1
fi

cat > "${EVIDENCE_DIR_OVERRIDE}/phase28_summary.json" <<JSON
{
  "platform_identity": "WorkCaptain / ProWork",
  "phase": 28,
  "source_of_truth_commit": "${CURRENT_HEAD}",
  "phase28_timestamp_utc": "${TS_OVERRIDE}",
  "phase28_status": "ready",
  "resolved_phase26_evidence_dir": "${PHASE26_RESOLVED_DIR}",
  "commercial_execution_cockpit": true,
  "active_opportunity_operating_model": true,
  "opportunity_record_schema": true,
  "review_cadence_model": true,
  "pursuit_channel_model": true,
  "commercial_health_model": true,
  "opportunity_evidence_discipline": true,
  "active_pipeline_decision_workflow": true
}
JSON

cat > "${EVIDENCE_DIR_OVERRIDE}/cockpit_index.json" <<JSON
{
  "cockpit_framework": "${ROOT_DIR}/FND/WORKCAPTAIN_COMMERCIAL_EXECUTION_COCKPIT_FRAMEWORK.md",
  "active_opportunity_model": "${ROOT_DIR}/FND/WORKCAPTAIN_ACTIVE_OPPORTUNITY_OPERATING_MODEL.md",
  "opportunity_schema": "${ROOT_DIR}/FND/WORKCAPTAIN_OPPORTUNITY_RECORD_SCHEMA.md",
  "review_cadence": "${ROOT_DIR}/FND/WORKCAPTAIN_OPPORTUNITY_REVIEW_CADENCE_MODEL.md",
  "pursuit_channel_model": "${ROOT_DIR}/FND/WORKCAPTAIN_PURSUIT_CHANNEL_OPERATING_MODEL.md",
  "commercial_health_model": "${ROOT_DIR}/FND/WORKCAPTAIN_COMMERCIAL_HEALTH_AND_MOMENTUM_MODEL.md",
  "evidence_discipline": "${ROOT_DIR}/FND/WORKCAPTAIN_OPPORTUNITY_EVIDENCE_DISCIPLINE.md",
  "pipeline_decision_workflow": "${ROOT_DIR}/FND/WORKCAPTAIN_ACTIVE_PIPELINE_DECISION_WORKFLOW.md",
  "phase26_strict_validation_rule": "${ROOT_DIR}/FND/WORKCAPTAIN_PHASE26_STRICT_EVIDENCE_VALIDATION_RULE.md"
}
JSON

(
  cd "${EVIDENCE_DIR_OVERRIDE}"
  shasum -a 256 phase28_summary.json cockpit_index.json > MANIFEST.sha256
)

echo "PHASE28_STATUS=ready" | tee "${EVIDENCE_DIR_OVERRIDE}/decision.env"
echo "RESOLVED_PHASE26_EVIDENCE_DIR=${PHASE26_RESOLVED_DIR}" | tee -a "${EVIDENCE_DIR_OVERRIDE}/decision.env"
echo "COCKPIT_FRAMEWORK_PATH=${ROOT_DIR}/FND/WORKCAPTAIN_COMMERCIAL_EXECUTION_COCKPIT_FRAMEWORK.md" | tee -a "${EVIDENCE_DIR_OVERRIDE}/decision.env"
echo "ACTIVE_OPPORTUNITY_MODEL_PATH=${ROOT_DIR}/FND/WORKCAPTAIN_ACTIVE_OPPORTUNITY_OPERATING_MODEL.md" | tee -a "${EVIDENCE_DIR_OVERRIDE}/decision.env"
echo "OPPORTUNITY_SCHEMA_PATH=${ROOT_DIR}/FND/WORKCAPTAIN_OPPORTUNITY_RECORD_SCHEMA.md" | tee -a "${EVIDENCE_DIR_OVERRIDE}/decision.env"
echo "REVIEW_CADENCE_PATH=${ROOT_DIR}/FND/WORKCAPTAIN_OPPORTUNITY_REVIEW_CADENCE_MODEL.md" | tee -a "${EVIDENCE_DIR_OVERRIDE}/decision.env"
echo "PURSUIT_CHANNEL_MODEL_PATH=${ROOT_DIR}/FND/WORKCAPTAIN_PURSUIT_CHANNEL_OPERATING_MODEL.md" | tee -a "${EVIDENCE_DIR_OVERRIDE}/decision.env"
echo "COMMERCIAL_HEALTH_MODEL_PATH=${ROOT_DIR}/FND/WORKCAPTAIN_COMMERCIAL_HEALTH_AND_MOMENTUM_MODEL.md" | tee -a "${EVIDENCE_DIR_OVERRIDE}/decision.env"
echo "EVIDENCE_DISCIPLINE_PATH=${ROOT_DIR}/FND/WORKCAPTAIN_OPPORTUNITY_EVIDENCE_DISCIPLINE.md" | tee -a "${EVIDENCE_DIR_OVERRIDE}/decision.env"
echo "PIPELINE_DECISION_WORKFLOW_PATH=${ROOT_DIR}/FND/WORKCAPTAIN_ACTIVE_PIPELINE_DECISION_WORKFLOW.md" | tee -a "${EVIDENCE_DIR_OVERRIDE}/decision.env"
echo "PHASE26_STRICT_VALIDATION_RULE_PATH=${ROOT_DIR}/FND/WORKCAPTAIN_PHASE26_STRICT_EVIDENCE_VALIDATION_RULE.md" | tee -a "${EVIDENCE_DIR_OVERRIDE}/decision.env"

echo ""
echo "PHASE28_COMPLETE"
echo "EVIDENCE_RUN_DIR=${EVIDENCE_DIR_OVERRIDE}"
echo "PHASE28_STATUS=ready"
