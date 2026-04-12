#!/usr/bin/env bash
set -euo pipefail

if [ "${#}" -ne 4 ]; then
  echo "usage: workcaptain_phase85_truth_capture_execute.sh <repo_root> <output_evidence_dir> <contract_json> <uplift_file>"
  exit 1
fi

REPO_ROOT="$1"
OUTPUT_EVIDENCE_DIR="$2"
CONTRACT_JSON="$3"
UPLIFT_FILE="$4"

if [ ! -d "${REPO_ROOT}" ]; then
  echo "FAIL_CLOSED: repo root missing: ${REPO_ROOT}"
  exit 1
fi

mkdir -p "${OUTPUT_EVIDENCE_DIR}"

python3 "${REPO_ROOT}/scripts/workcaptain_phase85_truth_capture_check.py" \
  "${REPO_ROOT}" \
  "${OUTPUT_EVIDENCE_DIR}" \
  "${CONTRACT_JSON}" \
  "${UPLIFT_FILE}"

cat > "${OUTPUT_EVIDENCE_DIR}/EXECUTION_REPORT.md" <<REPORT
# PHASE 85 TRUTH CAPTURE EXECUTION REPORT

- Repo root: ${REPO_ROOT}
- Output evidence dir: ${OUTPUT_EVIDENCE_DIR}
- Uplift file: ${UPLIFT_FILE}
- Truth capture status: COMPLETE
- No-guessing role: ENFORCED
- Final rerun posture: COMPUTED_FROM_VALIDATED_REAL_WORLD_TRUTH
REPORT

(
  cd "${OUTPUT_EVIDENCE_DIR}"
  find . -type f | sort | sed 's#^\./##' > MANIFEST.txt
  while IFS= read -r file; do
    shasum -a 256 "${file}"
  done < MANIFEST.txt > MANIFEST.sha256
)
