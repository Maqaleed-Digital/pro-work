#!/usr/bin/env bash
# WORKCAPTAIN / PROWORK — PHASE 25: Institutional Deployment Readiness + External Assurance Operations
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BASELINE_COMMIT="${PHASE25_BASELINE_COMMIT:-}"
TS_OVERRIDE="${PHASE25_TS:-}"
EVIDENCE_DIR_OVERRIDE="${PHASE25_EVIDENCE_DIR:-}"

if [ -z "${BASELINE_COMMIT}" ]; then
  echo "MISSING_ENV: PHASE25_BASELINE_COMMIT"
  exit 1
fi

if [ -z "${TS_OVERRIDE}" ]; then
  TS_OVERRIDE="$(date -u +%Y%m%dT%H%M%SZ)"
fi

if [ -z "${EVIDENCE_DIR_OVERRIDE}" ]; then
  EVIDENCE_DIR_OVERRIDE="${ROOT_DIR}/evidence/phase25_${TS_OVERRIDE}"
fi

mkdir -p "${EVIDENCE_DIR_OVERRIDE}"

# ---------------------------------------------------------------------------
# Gate 1: source-of-truth commit
# ---------------------------------------------------------------------------
CURRENT_HEAD="$(git -C "${ROOT_DIR}" rev-parse HEAD)"
if [ "${CURRENT_HEAD}" != "${BASELINE_COMMIT}" ]; then
  echo "PHASE25_STATUS=blocked" | tee "${EVIDENCE_DIR_OVERRIDE}/decision.env"
  echo "BLOCK_REASON=baseline_commit_mismatch" | tee -a "${EVIDENCE_DIR_OVERRIDE}/decision.env"
  echo "EXPECTED=${BASELINE_COMMIT}" | tee -a "${EVIDENCE_DIR_OVERRIDE}/decision.env"
  echo "ACTUAL=${CURRENT_HEAD}" | tee -a "${EVIDENCE_DIR_OVERRIDE}/decision.env"
  exit 1
fi

# ---------------------------------------------------------------------------
# Gate 2: Phase 24 prerequisites
# ---------------------------------------------------------------------------
# Find phase24 evidence directory (timestamp may vary)
found_phase24=false
for d in "${ROOT_DIR}"/evidence/phase24_*/; do
  if [ -f "${d}governance_seal.json" ]; then
    found_phase24=true
    break
  fi
done
if [ "$found_phase24" = "false" ]; then
  echo "PHASE25_STATUS=blocked" | tee "${EVIDENCE_DIR_OVERRIDE}/decision.env"
  echo "BLOCK_REASON=missing_phase24_governance_seal" | tee -a "${EVIDENCE_DIR_OVERRIDE}/decision.env"
  exit 1
fi

REQUIRED_PHASE24_FILES=(
  "${ROOT_DIR}/FND/WORKCAPTAIN_BOARD_READINESS_CERTIFICATION_PACK.md"
  "${ROOT_DIR}/FND/WORKCAPTAIN_ENTERPRISE_CLIENT_ASSURANCE_PROFILE.md"
  "${ROOT_DIR}/FND/WORKCAPTAIN_SOVEREIGN_REGULATORY_POSITIONING_DECLARATION.md"
  "${ROOT_DIR}/FND/WORKCAPTAIN_PHASE_24_CERTIFICATION_STATUS_MODEL.json"
)
for f in "${REQUIRED_PHASE24_FILES[@]}"; do
  if [ ! -f "${f}" ]; then
    echo "PHASE25_STATUS=blocked" | tee "${EVIDENCE_DIR_OVERRIDE}/decision.env"
    echo "BLOCK_REASON=missing_phase24_artifact" | tee -a "${EVIDENCE_DIR_OVERRIDE}/decision.env"
    echo "MISSING_FILE=${f}" | tee -a "${EVIDENCE_DIR_OVERRIDE}/decision.env"
    exit 1
  fi
done

# ---------------------------------------------------------------------------
# Gate 3: Phase 25 artifacts
# ---------------------------------------------------------------------------
REQUIRED_PHASE25_FILES=(
  "${ROOT_DIR}/FND/WORKCAPTAIN_PHASE_25_INSTITUTIONAL_DEPLOYMENT_READINESS_AND_EXTERNAL_ASSURANCE_OPERATIONS.md"
  "${ROOT_DIR}/FND/WORKCAPTAIN_INSTITUTIONAL_DEPLOYMENT_READINESS_PACK.md"
  "${ROOT_DIR}/FND/WORKCAPTAIN_EXTERNAL_ASSURANCE_OPERATIONS_PROTOCOL.md"
  "${ROOT_DIR}/FND/WORKCAPTAIN_BOARD_PRESENTATION_SUMMARY.md"
  "${ROOT_DIR}/FND/WORKCAPTAIN_INVESTOR_CERTIFICATION_NARRATIVE.md"
  "${ROOT_DIR}/FND/WORKCAPTAIN_ENTERPRISE_DILIGENCE_RESPONSE_PACK.md"
  "${ROOT_DIR}/FND/WORKCAPTAIN_SOVEREIGN_PARTNER_POSITIONING_PACK.md"
  "${ROOT_DIR}/FND/WORKCAPTAIN_CERTIFICATION_MAINTENANCE_AND_RENEWAL_PROTOCOL.md"
  "${ROOT_DIR}/FND/WORKCAPTAIN_ASSURANCE_DISCLOSURE_BOUNDARY.md"
)
for f in "${REQUIRED_PHASE25_FILES[@]}"; do
  if [ ! -f "${f}" ]; then
    echo "PHASE25_STATUS=blocked" | tee "${EVIDENCE_DIR_OVERRIDE}/decision.env"
    echo "BLOCK_REASON=missing_required_phase25_file" | tee -a "${EVIDENCE_DIR_OVERRIDE}/decision.env"
    echo "MISSING_FILE=${f}" | tee -a "${EVIDENCE_DIR_OVERRIDE}/decision.env"
    exit 1
  fi
done

# ---------------------------------------------------------------------------
# Gate 4: clean working tree
# ---------------------------------------------------------------------------
if [ -n "$(git -C "${ROOT_DIR}" status --porcelain)" ]; then
  echo "PHASE25_STATUS=blocked" | tee "${EVIDENCE_DIR_OVERRIDE}/decision.env"
  echo "BLOCK_REASON=working_tree_dirty_before_finalize" | tee -a "${EVIDENCE_DIR_OVERRIDE}/decision.env"
  git -C "${ROOT_DIR}" status --short | tee -a "${EVIDENCE_DIR_OVERRIDE}/decision.env"
  exit 1
fi

# ---------------------------------------------------------------------------
# All gates passed — generate Phase 25 artifacts
# ---------------------------------------------------------------------------
cat > "${EVIDENCE_DIR_OVERRIDE}/phase25_summary.json" <<JSON
{
  "platform_identity": "WorkCaptain / ProWork",
  "phase": 25,
  "source_of_truth_commit": "${CURRENT_HEAD}",
  "phase25_timestamp_utc": "${TS_OVERRIDE}",
  "phase25_status": "ready",
  "institutional_deployment_readiness": true,
  "external_assurance_operations": true,
  "board_summary_ready": true,
  "investor_narrative_ready": true,
  "enterprise_diligence_pack_ready": true,
  "sovereign_positioning_pack_ready": true,
  "renewal_protocol_ready": true
}
JSON

cat > "${EVIDENCE_DIR_OVERRIDE}/assurance_index.json" <<JSON
{
  "institutional_readiness_pack": "${ROOT_DIR}/FND/WORKCAPTAIN_INSTITUTIONAL_DEPLOYMENT_READINESS_PACK.md",
  "external_assurance_protocol": "${ROOT_DIR}/FND/WORKCAPTAIN_EXTERNAL_ASSURANCE_OPERATIONS_PROTOCOL.md",
  "board_presentation_summary": "${ROOT_DIR}/FND/WORKCAPTAIN_BOARD_PRESENTATION_SUMMARY.md",
  "investor_narrative": "${ROOT_DIR}/FND/WORKCAPTAIN_INVESTOR_CERTIFICATION_NARRATIVE.md",
  "enterprise_diligence_pack": "${ROOT_DIR}/FND/WORKCAPTAIN_ENTERPRISE_DILIGENCE_RESPONSE_PACK.md",
  "sovereign_positioning_pack": "${ROOT_DIR}/FND/WORKCAPTAIN_SOVEREIGN_PARTNER_POSITIONING_PACK.md",
  "renewal_protocol": "${ROOT_DIR}/FND/WORKCAPTAIN_CERTIFICATION_MAINTENANCE_AND_RENEWAL_PROTOCOL.md",
  "assurance_disclosure_boundary": "${ROOT_DIR}/FND/WORKCAPTAIN_ASSURANCE_DISCLOSURE_BOUNDARY.md"
}
JSON

(
  cd "${EVIDENCE_DIR_OVERRIDE}"
  shasum -a 256 phase25_summary.json assurance_index.json > MANIFEST.sha256
)

{
  echo "PHASE25_STATUS=ready"
  echo "INSTITUTIONAL_READINESS_PACK_PATH=${ROOT_DIR}/FND/WORKCAPTAIN_INSTITUTIONAL_DEPLOYMENT_READINESS_PACK.md"
  echo "EXTERNAL_ASSURANCE_PROTOCOL_PATH=${ROOT_DIR}/FND/WORKCAPTAIN_EXTERNAL_ASSURANCE_OPERATIONS_PROTOCOL.md"
  echo "BOARD_PRESENTATION_SUMMARY_PATH=${ROOT_DIR}/FND/WORKCAPTAIN_BOARD_PRESENTATION_SUMMARY.md"
  echo "INVESTOR_NARRATIVE_PATH=${ROOT_DIR}/FND/WORKCAPTAIN_INVESTOR_CERTIFICATION_NARRATIVE.md"
  echo "ENTERPRISE_DILIGENCE_PACK_PATH=${ROOT_DIR}/FND/WORKCAPTAIN_ENTERPRISE_DILIGENCE_RESPONSE_PACK.md"
  echo "SOVEREIGN_POSITIONING_PACK_PATH=${ROOT_DIR}/FND/WORKCAPTAIN_SOVEREIGN_PARTNER_POSITIONING_PACK.md"
  echo "RENEWAL_PROTOCOL_PATH=${ROOT_DIR}/FND/WORKCAPTAIN_CERTIFICATION_MAINTENANCE_AND_RENEWAL_PROTOCOL.md"
} | tee "${EVIDENCE_DIR_OVERRIDE}/decision.env"

echo ""
echo "PHASE25_COMPLETE"
echo "EVIDENCE_RUN_DIR=${EVIDENCE_DIR_OVERRIDE}"
echo "PHASE25_STATUS=ready"
echo "INSTITUTIONAL_READINESS_PACK_PATH=${ROOT_DIR}/FND/WORKCAPTAIN_INSTITUTIONAL_DEPLOYMENT_READINESS_PACK.md"
echo "EXTERNAL_ASSURANCE_PROTOCOL_PATH=${ROOT_DIR}/FND/WORKCAPTAIN_EXTERNAL_ASSURANCE_OPERATIONS_PROTOCOL.md"
echo "BOARD_PRESENTATION_SUMMARY_PATH=${ROOT_DIR}/FND/WORKCAPTAIN_BOARD_PRESENTATION_SUMMARY.md"
echo "INVESTOR_NARRATIVE_PATH=${ROOT_DIR}/FND/WORKCAPTAIN_INVESTOR_CERTIFICATION_NARRATIVE.md"
echo "ENTERPRISE_DILIGENCE_PACK_PATH=${ROOT_DIR}/FND/WORKCAPTAIN_ENTERPRISE_DILIGENCE_RESPONSE_PACK.md"
echo "SOVEREIGN_POSITIONING_PACK_PATH=${ROOT_DIR}/FND/WORKCAPTAIN_SOVEREIGN_PARTNER_POSITIONING_PACK.md"
echo "RENEWAL_PROTOCOL_PATH=${ROOT_DIR}/FND/WORKCAPTAIN_CERTIFICATION_MAINTENANCE_AND_RENEWAL_PROTOCOL.md"
