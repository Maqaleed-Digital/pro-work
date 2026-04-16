#!/usr/bin/env bash
set -euo pipefail

cd /opt/prowork

SPRINT="PROWORK-SPRINT-A-WOS-CORE"
TS_UTC="$(date -u +"%Y%m%dT%H%M%SZ")"
OUT_DIR="evidence_output/${SPRINT}/${TS_UTC}"

mkdir -p "${OUT_DIR}"

log()     { echo "[$(date -u +%H:%M:%S)] $*" | tee -a "${OUT_DIR}/evidence.log"; }
section() { printf "\n=== %s ===\n" "$*" | tee -a "${OUT_DIR}/evidence.log"; }

section "SPRINT A EVIDENCE REPORT"
{
  echo "Sprint:    ${SPRINT}"
  echo "Timestamp: ${TS_UTC}"
  echo "Root:      /opt/prowork"
  echo "Out:       ${OUT_DIR}"
  echo "Phase1:    5ff7de2"
} | tee -a "${OUT_DIR}/evidence.log"

section "GIT CONTEXT"
{
  echo "branch: $(git branch --show-current 2>/dev/null || echo 'n/a')"
  echo "commit: $(git log --oneline -1 2>/dev/null || echo 'n/a')"
  echo ""
  git log --oneline -5 2>/dev/null || true
  echo ""
  git status --short 2>/dev/null || true
} > "${OUT_DIR}/git_context.txt"
log "git_context captured"

section "NODE VERSION"
node -v > "${OUT_DIR}/node_version.txt"
log "node=$(cat "${OUT_DIR}/node_version.txt")"

section "FILE MANIFEST"
{
  echo "=== event_bus ==="
  ls -1 app/modules/event_bus/
  echo ""
  echo "=== execution_engine ==="
  ls -1 app/modules/execution_engine/
  echo ""
  echo "=== trust_engine ==="
  ls -1 app/modules/trust_engine/
  echo ""
  echo "=== wos ==="
  ls -1 app/modules/wos/
  ls -1 app/modules/wos/projections/
  echo ""
  echo "=== api ==="
  ls -1 app/api/
  echo ""
  echo "=== migrations ==="
  ls -1 app/storage/migrations/
  echo ""
  echo "=== tests ==="
  ls -1 tests/
  echo ""
  echo "=== docs ==="
  ls -1 docs/architecture/ 2>/dev/null || true
  ls -1 docs/governance/ 2>/dev/null || true
} > "${OUT_DIR}/file_manifest.txt"
log "file_manifest captured"

section "PHASE 1 TESTS (regression)"
node --test \
  tests/event_bus.envelope.test.js \
  tests/event_bus.publisher.test.js \
  tests/trust_engine.consumer.test.js \
  > "${OUT_DIR}/tests_phase1.txt" 2>&1 \
  && log "phase1_tests=PASS" \
  || log "phase1_tests=FAIL"

section "SPRINT A TESTS"
node --test \
  tests/wos.worker_service.test.js \
  tests/wos.project_service.test.js \
  tests/wos.workstream_service.test.js \
  tests/wos.milestone_service.test.js \
  tests/wos.assignment_service.test.js \
  tests/wos.dashboard_projection.test.js \
  > "${OUT_DIR}/tests_sprint_a.txt" 2>&1 \
  && log "sprint_a_tests=PASS" \
  || log "sprint_a_tests=FAIL"

section "ALL TESTS COMBINED"
node --test \
  tests/event_bus.envelope.test.js \
  tests/event_bus.publisher.test.js \
  tests/trust_engine.consumer.test.js \
  tests/wos.worker_service.test.js \
  tests/wos.project_service.test.js \
  tests/wos.workstream_service.test.js \
  tests/wos.milestone_service.test.js \
  tests/wos.assignment_service.test.js \
  tests/wos.dashboard_projection.test.js \
  > "${OUT_DIR}/tests_all.txt" 2>&1 \
  && log "all_tests=PASS" \
  || log "all_tests=FAIL"

# Extract test summary
SUMMARY="$(tail -8 "${OUT_DIR}/tests_all.txt")"
printf "%s\n" "${SUMMARY}" | tee -a "${OUT_DIR}/evidence.log"

section "SHA256 CHECKSUMS"
shasum -a 256 \
  app/modules/execution_engine/event_hooks.js \
  app/modules/wos/worker_service.js \
  app/modules/wos/pod_service.js \
  app/modules/wos/assignment_service.js \
  app/modules/wos/project_service.js \
  app/modules/wos/workstream_service.js \
  app/modules/wos/milestone_service.js \
  app/modules/wos/execution_job_service.js \
  app/modules/wos/index.js \
  app/modules/wos/projections/dashboard.js \
  app/api/wos_router.js \
  app/storage/migrations/20260306_sprint_a_wos_core.sql \
  docs/governance/sprint_a_wos_core.md \
  tests/wos.worker_service.test.js \
  tests/wos.project_service.test.js \
  tests/wos.workstream_service.test.js \
  tests/wos.milestone_service.test.js \
  tests/wos.assignment_service.test.js \
  tests/wos.dashboard_projection.test.js \
  scripts/prowork_sprint_a_evidence.sh \
  > "${OUT_DIR}/SHA256SUMS.txt"
log "checksums captured"

section "MANIFEST JSON"
COMMIT="$(git rev-parse HEAD 2>/dev/null || echo 'n/a')"
cat > "${OUT_DIR}/MANIFEST.json" <<MANIFEST
{
  "sprint": "${SPRINT}",
  "ts_utc": "${TS_UTC}",
  "phase1_baseline": "5ff7de2",
  "commit": "${COMMIT}",
  "new_files": [
    "app/modules/wos/worker_service.js",
    "app/modules/wos/pod_service.js",
    "app/modules/wos/assignment_service.js",
    "app/modules/wos/project_service.js",
    "app/modules/wos/workstream_service.js",
    "app/modules/wos/milestone_service.js",
    "app/modules/wos/execution_job_service.js",
    "app/modules/wos/index.js",
    "app/modules/wos/projections/dashboard.js",
    "app/api/wos_router.js",
    "app/storage/migrations/20260306_sprint_a_wos_core.sql",
    "docs/governance/sprint_a_wos_core.md",
    "tests/wos.worker_service.test.js",
    "tests/wos.project_service.test.js",
    "tests/wos.workstream_service.test.js",
    "tests/wos.milestone_service.test.js",
    "tests/wos.assignment_service.test.js",
    "tests/wos.dashboard_projection.test.js",
    "scripts/prowork_sprint_a_evidence.sh"
  ],
  "updated_files": [
    "app/modules/execution_engine/event_hooks.js"
  ]
}
MANIFEST
log "MANIFEST.json written"

section "ZIP PACK"
(
  cd "evidence_output/${SPRINT}"
  zip -r "${SPRINT}_${TS_UTC}.zip" "${TS_UTC}" >/dev/null
  shasum -a 256 "${SPRINT}_${TS_UTC}.zip" > "${SPRINT}_${TS_UTC}.zip.sha256"
)
log "zip=evidence_output/${SPRINT}/${SPRINT}_${TS_UTC}.zip"

section "DONE"
log "Evidence folder: ${OUT_DIR}"
ls -la "${OUT_DIR}" >> "${OUT_DIR}/evidence.log"

echo ""
echo "OUT_DIR=${OUT_DIR}"
echo "ZIP=evidence_output/${SPRINT}/${SPRINT}_${TS_UTC}.zip"
echo "COMMIT=${COMMIT}"
