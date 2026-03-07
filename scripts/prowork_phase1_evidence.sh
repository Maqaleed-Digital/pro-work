#!/usr/bin/env bash
set -euo pipefail

cd /opt/prowork

PHASE="PROWORK-PHASE1-TRUST-EVENT-FOUNDATION"
TS_UTC="$(date -u +"%Y%m%dT%H%M%SZ")"
OUT_DIR="evidence_output/${PHASE}/${TS_UTC}"

mkdir -p "${OUT_DIR}"

log() { echo "[$(date -u +%H:%M:%S)] $*" | tee -a "${OUT_DIR}/evidence.log"; }
section() { printf "\n=== %s ===\n" "$*" | tee -a "${OUT_DIR}/evidence.log"; }

section "PHASE1 EVIDENCE REPORT"
{
  echo "Phase:     ${PHASE}"
  echo "Timestamp: ${TS_UTC}"
  echo "Root:      /opt/prowork"
  echo "Out:       ${OUT_DIR}"
} | tee -a "${OUT_DIR}/evidence.log"

section "GIT CONTEXT"
{
  echo "branch: $(git branch --show-current 2>/dev/null || echo 'n/a')"
  echo "commit: $(git log --oneline -1 2>/dev/null || echo 'n/a')"
  git status --short 2>/dev/null || true
} > "${OUT_DIR}/git_context.txt"
log "git_context captured"

section "NODE VERSION"
node -v > "${OUT_DIR}/node_version.txt"
log "node=$(cat "${OUT_DIR}/node_version.txt")"

section "FILE MANIFEST"
{
  ls -1 \
    app/modules/event_bus/ \
    app/modules/execution_engine/ \
    app/modules/trust_engine/ \
    tests/ \
    app/storage/migrations/ \
    docs/architecture/ \
    scripts/
} > "${OUT_DIR}/file_manifest.txt"
log "file_manifest captured"

section "TESTS"
node --test \
  tests/event_bus.envelope.test.js \
  tests/event_bus.publisher.test.js \
  tests/trust_engine.consumer.test.js \
  > "${OUT_DIR}/tests.txt" 2>&1 \
  && log "tests=PASS" \
  || log "tests=FAIL"

section "SHA256 CHECKSUMS"
shasum -a 256 \
  app/modules/event_bus/envelope.js \
  app/modules/event_bus/schema_registry.js \
  app/modules/event_bus/index.js \
  app/modules/execution_engine/event_hooks.js \
  app/modules/trust_engine/ledger_hash.js \
  app/modules/trust_engine/trust_consumer.js \
  app/storage/migrations/20260306_phase1_trust_event_foundation.sql \
  tests/event_bus.envelope.test.js \
  tests/event_bus.publisher.test.js \
  tests/trust_engine.consumer.test.js \
  docs/architecture/phase1_trust_event_foundation.md \
  scripts/prowork_phase1_evidence.sh \
  > "${OUT_DIR}/SHA256SUMS.txt"
log "checksums captured"

section "MANIFEST JSON"
cat > "${OUT_DIR}/MANIFEST.json" <<MANIFEST
{
  "phase": "${PHASE}",
  "ts_utc": "${TS_UTC}",
  "files": [
    "app/modules/event_bus/envelope.js",
    "app/modules/event_bus/schema_registry.js",
    "app/modules/event_bus/index.js",
    "app/modules/execution_engine/event_hooks.js",
    "app/modules/trust_engine/ledger_hash.js",
    "app/modules/trust_engine/trust_consumer.js",
    "app/storage/migrations/20260306_phase1_trust_event_foundation.sql",
    "docs/architecture/phase1_trust_event_foundation.md",
    "tests/event_bus.envelope.test.js",
    "tests/event_bus.publisher.test.js",
    "tests/trust_engine.consumer.test.js",
    "scripts/prowork_phase1_evidence.sh"
  ]
}
MANIFEST
log "MANIFEST.json written"

section "ZIP PACK"
(
  cd "evidence_output/${PHASE}"
  zip -r "${PHASE}_${TS_UTC}.zip" "${TS_UTC}" >/dev/null
  shasum -a 256 "${PHASE}_${TS_UTC}.zip" > "${PHASE}_${TS_UTC}.zip.sha256"
)
log "zip=evidence_output/${PHASE}/${PHASE}_${TS_UTC}.zip"

section "DONE"
log "Evidence folder: ${OUT_DIR}"
ls -la "${OUT_DIR}" >> "${OUT_DIR}/evidence.log"

echo ""
echo "OUT_DIR=${OUT_DIR}"
echo "ZIP=evidence_output/${PHASE}/${PHASE}_${TS_UTC}.zip"
echo "ZIP_SHA=evidence_output/${PHASE}/${PHASE}_${TS_UTC}.zip.sha256"
