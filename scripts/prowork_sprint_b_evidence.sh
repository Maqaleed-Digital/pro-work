#!/usr/bin/env bash
set -euo pipefail

cd /opt/prowork || exit 1

if [ ! -d baseline ]; then
  echo "ERROR: baseline directory missing — run scripts/prowork_baseline_freeze.sh first"
  exit 1
fi

PHASE="PROWORK-SPRINT-B-SOVEREIGN-RECRUITING"
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
  git log --oneline -3 || true
  echo ""
  echo "## Node"
  node -v
} > "${OUT_DIR}/git_context.txt"

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
  tests/recruiting.candidate_service.test.js \
  tests/recruiting.requisition_service.test.js \
  tests/recruiting.skill_graph.test.js \
  tests/recruiting.matching_engine.test.js \
  tests/recruiting.router.test.js \
  tests/recruiting.trust_integration.test.js \
  > "${OUT_DIR}/tests.txt" 2>&1

find app docs tests scripts -type f | sort > "${OUT_DIR}/file_manifest.txt"

shasum -a 256 \
  app/modules/recruiting/candidate_service.js \
  app/modules/recruiting/requisition_service.js \
  app/modules/recruiting/skill_graph.js \
  app/modules/recruiting/matching_engine.js \
  app/modules/recruiting/compliance_preview.js \
  app/modules/recruiting/index.js \
  app/api/recruiting_router.js \
  app/modules/event_bus/schema_registry.js \
  app/storage/migrations/20260306_sprint_b_sovereign_recruiting.sql \
  docs/governance/sprint_b_sovereign_recruiting.md \
  tests/recruiting.candidate_service.test.js \
  tests/recruiting.requisition_service.test.js \
  tests/recruiting.skill_graph.test.js \
  tests/recruiting.matching_engine.test.js \
  tests/recruiting.router.test.js \
  tests/recruiting.trust_integration.test.js \
  scripts/prowork_sprint_b_evidence.sh \
  > "${OUT_DIR}/SHA256SUMS.txt"

cat > "${OUT_DIR}/MANIFEST.json" << MANIFEST
{
  "phase": "${PHASE}",
  "brd_version": "V3",
  "baseline_commits": ["5ff7de2", "f53327c"],
  "ts_utc": "${TS_UTC}",
  "evidence_pack_template": "EP-WOS-RECRUIT-01",
  "trust_sensitive_events": [
    "CANDIDATE_SHORTLISTED",
    "NITAQAT_PREVIEW_GENERATED",
    "OCCUPATION_MATCH_VALIDATED",
    "AI_MATCH_EXPLANATION_LOGGED"
  ]
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
