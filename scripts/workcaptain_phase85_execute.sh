#!/usr/bin/env bash
set -euo pipefail

if [ "${#}" -ne 5 ]; then
  echo "usage: workcaptain_phase85_execute.sh <repo_root> <prior_evidence_dir> <output_evidence_dir> <thresholds_json> <uplift_file>"
  exit 1
fi

REPO_ROOT="$1"
PRIOR_EVIDENCE_DIR="$2"
OUTPUT_EVIDENCE_DIR="$3"
THRESHOLDS_JSON="$4"
UPLIFT_FILE="$5"

if [ ! -d "${REPO_ROOT}" ]; then
  echo "FAIL_CLOSED: repo root missing: ${REPO_ROOT}"
  exit 1
fi

if [ ! -d "${PRIOR_EVIDENCE_DIR}" ]; then
  echo "FAIL_CLOSED: prior evidence dir missing: ${PRIOR_EVIDENCE_DIR}"
  exit 1
fi

mkdir -p "${OUTPUT_EVIDENCE_DIR}"

python3 "${REPO_ROOT}/scripts/workcaptain_phase85_gap_closure.py" \
  "${REPO_ROOT}" \
  "${PRIOR_EVIDENCE_DIR}" \
  "${OUTPUT_EVIDENCE_DIR}" \
  "${THRESHOLDS_JSON}" \
  "${UPLIFT_FILE}"

cat > "${OUTPUT_EVIDENCE_DIR}/EXECUTION_REPORT.md" <<REPORT
# PHASE 85 EXECUTION REPORT

- Repo root: ${REPO_ROOT}
- Prior evidence dir: ${PRIOR_EVIDENCE_DIR}
- Output evidence dir: ${OUTPUT_EVIDENCE_DIR}
- Uplift file: ${UPLIFT_FILE}
- Phase 85 status: COMPLETE
- Uplift mode: FULL_CERT_GAP_CLOSURE
- Human approval mode: ENFORCED
- Final rerun posture: COMPUTED_FROM_VALIDATED_GAP_CLOSURE
REPORT

(
  cd "${OUTPUT_EVIDENCE_DIR}"
  find . -type f | sort | sed 's#^\./##' > MANIFEST.txt
  while IFS= read -r file; do
    shasum -a 256 "${file}"
  done < MANIFEST.txt > MANIFEST.sha256
)
