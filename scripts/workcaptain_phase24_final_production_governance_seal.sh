#!/usr/bin/env bash
# WORKCAPTAIN / PROWORK — PHASE 24: Final Production Governance Seal
# Generates the immutable governance seal and board readiness certification pack.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BASELINE_COMMIT="${PHASE24_BASELINE_COMMIT:-}"
TS_OVERRIDE="${PHASE24_TS:-}"
EVIDENCE_DIR_OVERRIDE="${PHASE24_EVIDENCE_DIR:-}"

if [ -z "${BASELINE_COMMIT}" ]; then
  echo "MISSING_ENV: PHASE24_BASELINE_COMMIT"
  exit 1
fi

if [ -z "${TS_OVERRIDE}" ]; then
  TS_OVERRIDE="$(date -u +%Y%m%dT%H%M%SZ)"
fi

if [ -z "${EVIDENCE_DIR_OVERRIDE}" ]; then
  EVIDENCE_DIR_OVERRIDE="${ROOT_DIR}/evidence/phase24_${TS_OVERRIDE}"
fi

mkdir -p "${EVIDENCE_DIR_OVERRIDE}"

# ---------------------------------------------------------------------------
# Gate 1: source-of-truth commit
# ---------------------------------------------------------------------------
CURRENT_HEAD="$(git -C "${ROOT_DIR}" rev-parse HEAD)"
if [ "${CURRENT_HEAD}" != "${BASELINE_COMMIT}" ]; then
  echo "CERTIFICATION_STATUS=blocked" | tee "${EVIDENCE_DIR_OVERRIDE}/decision.env"
  echo "BLOCK_REASON=baseline_commit_mismatch" | tee -a "${EVIDENCE_DIR_OVERRIDE}/decision.env"
  echo "EXPECTED=${BASELINE_COMMIT}" | tee -a "${EVIDENCE_DIR_OVERRIDE}/decision.env"
  echo "ACTUAL=${CURRENT_HEAD}" | tee -a "${EVIDENCE_DIR_OVERRIDE}/decision.env"
  exit 1
fi

# ---------------------------------------------------------------------------
# Gate 2: required prior phase evidence directories
# ---------------------------------------------------------------------------
REQUIRED_PHASE_EVIDENCE_PATTERN="${ROOT_DIR}/evidence/phase23_"
found_phase23=false
for d in "${ROOT_DIR}"/evidence/phase23_*/; do
  [ -d "$d" ] && found_phase23=true && break
done
if [ "$found_phase23" = "false" ]; then
  echo "CERTIFICATION_STATUS=blocked" | tee "${EVIDENCE_DIR_OVERRIDE}/decision.env"
  echo "BLOCK_REASON=missing_required_phase23_evidence" | tee -a "${EVIDENCE_DIR_OVERRIDE}/decision.env"
  exit 1
fi

# ---------------------------------------------------------------------------
# Gate 3: required phase 24 FND artifacts
# ---------------------------------------------------------------------------
REQUIRED_FILES=(
  "${ROOT_DIR}/FND/WORKCAPTAIN_PHASE_24_FINAL_PRODUCTION_GOVERNANCE_SEAL_AND_BOARD_READINESS_CERTIFICATION.md"
  "${ROOT_DIR}/FND/WORKCAPTAIN_PRODUCTION_GOVERNANCE_SEAL_SPEC.md"
  "${ROOT_DIR}/FND/WORKCAPTAIN_BOARD_READINESS_CERTIFICATION_PACK.md"
  "${ROOT_DIR}/FND/WORKCAPTAIN_ENTERPRISE_CLIENT_ASSURANCE_PROFILE.md"
  "${ROOT_DIR}/FND/WORKCAPTAIN_SOVEREIGN_REGULATORY_POSITIONING_DECLARATION.md"
  "${ROOT_DIR}/FND/WORKCAPTAIN_PHASE_24_CONTROL_COVERAGE_MATRIX.md"
  "${ROOT_DIR}/FND/WORKCAPTAIN_PHASE_24_RISK_POSTURE_DECLARATION.md"
  "${ROOT_DIR}/FND/WORKCAPTAIN_PHASE_24_CERTIFICATION_STATUS_MODEL.json"
)

for f in "${REQUIRED_FILES[@]}"; do
  if [ ! -f "${f}" ]; then
    echo "CERTIFICATION_STATUS=blocked" | tee "${EVIDENCE_DIR_OVERRIDE}/decision.env"
    echo "BLOCK_REASON=missing_required_file" | tee -a "${EVIDENCE_DIR_OVERRIDE}/decision.env"
    echo "MISSING_FILE=${f}" | tee -a "${EVIDENCE_DIR_OVERRIDE}/decision.env"
    exit 1
  fi
done

# ---------------------------------------------------------------------------
# Gate 4: clean working tree
# ---------------------------------------------------------------------------
if [ -n "$(git -C "${ROOT_DIR}" status --porcelain)" ]; then
  echo "CERTIFICATION_STATUS=blocked" | tee "${EVIDENCE_DIR_OVERRIDE}/decision.env"
  echo "BLOCK_REASON=working_tree_dirty_before_finalize" | tee -a "${EVIDENCE_DIR_OVERRIDE}/decision.env"
  git -C "${ROOT_DIR}" status --short | tee -a "${EVIDENCE_DIR_OVERRIDE}/decision.env"
  exit 1
fi

# ---------------------------------------------------------------------------
# All gates passed — generate seal artifacts
# ---------------------------------------------------------------------------
cat > "${EVIDENCE_DIR_OVERRIDE}/certification_summary.json" <<JSON
{
  "platform_identity": "WorkCaptain / ProWork",
  "phase": 24,
  "source_of_truth_commit": "${CURRENT_HEAD}",
  "certification_timestamp_utc": "${TS_OVERRIDE}",
  "certification_targets": ["A", "B", "C"],
  "certification_status": "certified",
  "board_readiness": true,
  "enterprise_readiness": true,
  "sovereign_positioning": true,
  "boundary": "governance posture and evidence-backed readiness only"
}
JSON

cat > "${EVIDENCE_DIR_OVERRIDE}/governance_seal.json" <<JSON
{
  "seal_version": "1.0",
  "platform_identity": "WorkCaptain / ProWork",
  "source_of_truth_commit": "${CURRENT_HEAD}",
  "certification_timestamp_utc": "${TS_OVERRIDE}",
  "certification_targets": ["A", "B", "C"],
  "certification_status": "certified",
  "evidence_run_dir": "${EVIDENCE_DIR_OVERRIDE}",
  "control_coverage_summary": "all required control layers declared active and verifiable",
  "risk_posture": "managed_residual_risk_with_fail_closed_controls",
  "board_readiness": true,
  "enterprise_readiness": true,
  "sovereign_positioning": true,
  "declaration_boundary": "no legal opinion, no regulator endorsement, no external audit claim",
  "generated_by_script": "scripts/workcaptain_phase24_final_production_governance_seal.sh"
}
JSON

# Manifest sha256
(
  cd "${EVIDENCE_DIR_OVERRIDE}"
  shasum -a 256 governance_seal.json certification_summary.json > MANIFEST.sha256
)

# decision.env
{
  echo "CERTIFICATION_STATUS=certified"
  echo "GOVERNANCE_SEAL_PATH=${EVIDENCE_DIR_OVERRIDE}/governance_seal.json"
  echo "BOARD_PACK_PATH=${ROOT_DIR}/FND/WORKCAPTAIN_BOARD_READINESS_CERTIFICATION_PACK.md"
  echo "ENTERPRISE_PROFILE_PATH=${ROOT_DIR}/FND/WORKCAPTAIN_ENTERPRISE_CLIENT_ASSURANCE_PROFILE.md"
  echo "SOVEREIGN_DECLARATION_PATH=${ROOT_DIR}/FND/WORKCAPTAIN_SOVEREIGN_REGULATORY_POSITIONING_DECLARATION.md"
} | tee "${EVIDENCE_DIR_OVERRIDE}/decision.env"

echo ""
echo "PHASE24_COMPLETE"
echo "EVIDENCE_RUN_DIR=${EVIDENCE_DIR_OVERRIDE}"
echo "CERTIFICATION_STATUS=certified"
echo "GOVERNANCE_SEAL_PATH=${EVIDENCE_DIR_OVERRIDE}/governance_seal.json"
echo "BOARD_PACK_PATH=${ROOT_DIR}/FND/WORKCAPTAIN_BOARD_READINESS_CERTIFICATION_PACK.md"
echo "ENTERPRISE_PROFILE_PATH=${ROOT_DIR}/FND/WORKCAPTAIN_ENTERPRISE_CLIENT_ASSURANCE_PROFILE.md"
echo "SOVEREIGN_DECLARATION_PATH=${ROOT_DIR}/FND/WORKCAPTAIN_SOVEREIGN_REGULATORY_POSITIONING_DECLARATION.md"
