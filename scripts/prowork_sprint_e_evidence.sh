#!/usr/bin/env bash
set -euo pipefail

cd /opt/prowork || exit 1

PHASE="PROWORK-SPRINT-E-LIFECYCLE-ESB-OFFBOARDING"
TS_UTC="$(date -u +"%Y%m%dT%H%M%SZ")"
OUT_DIR="evidence_output/${PHASE}/${TS_UTC}"

mkdir -p "${OUT_DIR}"

{
  echo "# ${PHASE}"
  echo ""
  echo "## UTC"
  echo "${TS_UTC}"
  echo ""
  echo "## Git Context"
  git status -sb || true
  git log --oneline -6 || true
  echo ""
  echo "## Node"
  node -v
} > "${OUT_DIR}/git_context.txt"

node --test \
  tests/event_bus.envelope.test.js \
  tests/event_bus.publisher.test.js \
  tests/trust_engine.consumer.test.js \
  tests/lifecycle.lifecycle_service.test.js \
  tests/lifecycle.esb_policy_engine.test.js \
  tests/lifecycle.offboarding_service.test.js \
  tests/lifecycle.handover_service.test.js \
  tests/lifecycle.router.test.js \
  tests/lifecycle.trust_integration.test.js \
  > "${OUT_DIR}/tests.txt" 2>&1

find app docs tests scripts -type f | sort > "${OUT_DIR}/file_manifest.txt"

shasum -a 256 \
  app/modules/lifecycle/lifecycle_service.js \
  app/modules/lifecycle/esb_policy_engine.js \
  app/modules/lifecycle/offboarding_service.js \
  app/modules/lifecycle/handover_service.js \
  app/modules/lifecycle/dashboard_projection.js \
  app/modules/lifecycle/index.js \
  app/api/lifecycle_router.js \
  app/modules/event_bus/schema_registry.js \
  app/storage/migrations/20260307_sprint_e_lifecycle_esb_offboarding.sql \
  docs/governance/sprint_e_lifecycle_esb_offboarding.md \
  tests/lifecycle.lifecycle_service.test.js \
  tests/lifecycle.esb_policy_engine.test.js \
  tests/lifecycle.offboarding_service.test.js \
  tests/lifecycle.handover_service.test.js \
  tests/lifecycle.router.test.js \
  tests/lifecycle.trust_integration.test.js \
  scripts/prowork_sprint_e_evidence.sh \
  > "${OUT_DIR}/SHA256SUMS.txt"

cat > "${OUT_DIR}/MANIFEST.json" <<MANIFEST
{
  "phase": "${PHASE}",
  "baseline_commits": [
    "5ff7de2",
    "f53327c",
    "b5c8a62958443600a3583c75b15ae11400e25e2c",
    "391db4a",
    "d9a226b"
  ],
  "evidence_pack_template": "EP-WOS-OFFBOARD-01",
  "ts_utc": "${TS_UTC}"
}
MANIFEST

(
  cd "evidence_output/${PHASE}" || exit 1
  zip -r "${PHASE}_${TS_UTC}.zip" "${TS_UTC}" >/dev/null
  shasum -a 256 "${PHASE}_${TS_UTC}.zip" > "${PHASE}_${TS_UTC}.zip.sha256"
)

echo "OUT_DIR=${OUT_DIR}"
echo "ZIP=evidence_output/${PHASE}/${PHASE}_${TS_UTC}.zip"
echo "ZIP_SHA=evidence_output/${PHASE}/${PHASE}_${TS_UTC}.zip.sha256"
