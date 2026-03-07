#!/usr/bin/env bash
set -euo pipefail

cd /opt/prowork || exit 1

if [ ! -d baseline ]; then
  echo "ERROR: baseline directory missing — run scripts/prowork_baseline_freeze.sh first"
  exit 1
fi

PHASE="PROWORK-SPRINT-D-SOVEREIGN-HIRING"
TS_UTC="$(date -u +"%Y%m%dT%H%M%SZ")"
OUT_DIR="evidence_output/${PHASE}/${TS_UTC}"
ZIP="evidence_output/${PHASE}/${PHASE}_${TS_UTC}.zip"
ZIP_SHA="evidence_output/${PHASE}/${PHASE}_${TS_UTC}.zip.sha256"

echo "OUT_DIR=${OUT_DIR}"
echo "ZIP=${ZIP}"
echo "ZIP_SHA=${ZIP_SHA}"

mkdir -p "${OUT_DIR}"

# ── Test run ──────────────────────────────────────────────────────────────────
node --test \
  tests/event_bus.envelope.test.js \
  tests/event_bus.publisher.test.js \
  tests/trust_engine.consumer.test.js \
  tests/hiring.case.test.js \
  tests/hiring.compensation.test.js \
  tests/hiring.approval.test.js \
  tests/hiring.offer.test.js \
  tests/hiring.acceptance.test.js \
  tests/hiring.qiwa_mapping.test.js \
  tests/hiring.router.test.js \
  tests/hiring.trust_integration.test.js \
  2>&1 | tee "${OUT_DIR}/test_run.txt"

# ── Git context ───────────────────────────────────────────────────────────────
{
  echo "# ${PHASE}"
  echo "## UTC: ${TS_UTC}"
  echo "## Git log (last 5)"
  git log --oneline -5
  echo "## Node"
  node -v
} > "${OUT_DIR}/git_context.txt"

# ── SHA256 of key source files ────────────────────────────────────────────────
{
  shasum -a 256 \
    app/modules/event_bus/schema_registry.js \
    app/modules/hiring/hiring_case_service.js \
    app/modules/hiring/compensation_service.js \
    app/modules/hiring/approval_service.js \
    app/modules/hiring/offer_service.js \
    app/modules/hiring/acceptance_service.js \
    app/modules/hiring/qiwa_mapping_service.js \
    app/modules/hiring/index.js \
    app/api/hiring_router.js \
    app/storage/migrations/20260307_sprint_d_sovereign_hiring.sql
} > "${OUT_DIR}/SHA256SUMS.txt"

# ── MANIFEST ──────────────────────────────────────────────────────────────────
BASELINE_FILE="$(ls baseline/PROWORK_BASELINE_*.json | sort | tail -1)"
BASELINE_COMMIT="$(node -e "const b=require('./${BASELINE_FILE}'); console.log(b.commit_short);")"
BASELINE_SHA="$(node -e "const b=require('./${BASELINE_FILE}'); console.log(b.evidence_sha256);")"

cat > "${OUT_DIR}/MANIFEST.json" <<EOF
{
  "phase": "${PHASE}",
  "brd_version": "V3",
  "baseline_commit": "${BASELINE_COMMIT}",
  "baseline_sha256": "${BASELINE_SHA}",
  "ts_utc": "${TS_UTC}",
  "evidence_pack_templates": ["EP-WOS-HIRING-01"],
  "trust_sensitive_events": [
    "HIRING_DECISION_RECORDED",
    "OFFER_APPROVED",
    "OFFER_ACCEPTED",
    "CONTRACT_MIRROR_MAPPED",
    "HIRING_CONTRACT_SIGNED",
    "HIRING_CONTRACT_ACTIVATED"
  ]
}
EOF

# ── ZIP + SHA ─────────────────────────────────────────────────────────────────
zip -r "${ZIP}" "${OUT_DIR}" > /dev/null
(cd "$(dirname "${ZIP}")" && shasum -a 256 "$(basename "${ZIP}")") > "${ZIP_SHA}"
