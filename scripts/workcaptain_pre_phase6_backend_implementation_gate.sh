#!/usr/bin/env bash
set -euo pipefail

fail() {
  echo "ERROR: $*" >&2
  exit 1
}

TIMESTAMP="$(date -u +"%Y%m%dT%H%M%SZ")"
EVIDENCE_RUN_DIR="FND/EVIDENCE/WORKCAPTAIN-PRE-PHASE-6-BACKEND-IMPLEMENTATION/${TIMESTAMP}"
mkdir -p "${EVIDENCE_RUN_DIR}"

required_paths=(
  "services/api-service/Dockerfile"
  "services/trust-processor/Dockerfile"
  "services/agent-orchestrator/Dockerfile"
  "services/background-worker/Dockerfile"
)

for path in "${required_paths[@]}"; do
  if [[ ! -f "${path}" ]]; then
    echo "MISSING ${path}" | tee -a "${EVIDENCE_RUN_DIR}/blocked.log"
    fail "Required file missing: ${path}"
  fi
done

find services -maxdepth 3 -type f | sort > "${EVIDENCE_RUN_DIR}/services_file_listing.txt"
find services -maxdepth 2 -name Dockerfile | sort > "${EVIDENCE_RUN_DIR}/dockerfiles.txt"
find services -maxdepth 2 -type d | sort > "${EVIDENCE_RUN_DIR}/services_tree_dirs.txt"

cat > "${EVIDENCE_RUN_DIR}/build_commands.txt" <<'CMDS'
docker build -t me-central2-docker.pkg.dev/prj-maq-workcaptain-nonprod/workcaptain/api-service:<tag> -f services/api-service/Dockerfile services/api-service/
docker build -t me-central2-docker.pkg.dev/prj-maq-workcaptain-nonprod/workcaptain/trust-processor:<tag> -f services/trust-processor/Dockerfile services/trust-processor/
docker build -t me-central2-docker.pkg.dev/prj-maq-workcaptain-nonprod/workcaptain/agent-orchestrator:<tag> -f services/agent-orchestrator/Dockerfile services/agent-orchestrator/
docker build -t me-central2-docker.pkg.dev/prj-maq-workcaptain-nonprod/workcaptain/background-worker:<tag> -f services/background-worker/Dockerfile services/background-worker/
CMDS

cat > "${EVIDENCE_RUN_DIR}/MANIFEST.txt" <<MANIFEST
PHASE=WORKCAPTAIN-PRE-PHASE-6-BACKEND-IMPLEMENTATION
TIMESTAMP=${TIMESTAMP}
EVIDENCE_RUN_DIR=${EVIDENCE_RUN_DIR}
MANIFEST

echo "PASS" | tee "${EVIDENCE_RUN_DIR}/status.txt"
echo "EVIDENCE_RUN_DIR=${EVIDENCE_RUN_DIR}"
