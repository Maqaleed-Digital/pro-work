#!/usr/bin/env bash
set -euo pipefail

cd /opt/prowork || exit 1

PHASE="PROWORK-SPRINT-C-SOVEREIGN-ONBOARDING"
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
  tests/onboarding.document_service.test.js \
  tests/onboarding.checklist_service.test.js \
  tests/onboarding.contract_service.test.js \
  tests/onboarding.consent_service.test.js \
  tests/onboarding.compliance_service.test.js \
  tests/onboarding.probation_service.test.js \
  tests/onboarding.router.test.js \
  tests/onboarding.trust_integration.test.js \
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
    app/modules/onboarding/document_service.js \
    app/modules/onboarding/checklist_service.js \
    app/modules/onboarding/contract_service.js \
    app/modules/onboarding/consent_service.js \
    app/modules/onboarding/compliance_service.js \
    app/modules/onboarding/probation_service.js \
    app/modules/onboarding/index.js \
    app/api/onboarding_router.js \
    app/storage/migrations/20260307_sprint_c_sovereign_onboarding.sql
} > "${OUT_DIR}/SHA256SUMS.txt"

# ── MANIFEST ──────────────────────────────────────────────────────────────────
cat > "${OUT_DIR}/MANIFEST.json" <<EOF
{
  "phase": "${PHASE}",
  "brd_version": "V3",
  "baseline_commits": ["5ff7de2", "f53327c", "b5c8a62"],
  "ts_utc": "${TS_UTC}",
  "evidence_pack_templates": ["EP-WOS-ONBOARD-01", "EP-WOS-PROB-01"],
  "trust_sensitive_events": [
    "DOCUMENT_VERIFIED",
    "WPS_READINESS_GENERATED",
    "CONTRACT_SIGNED",
    "CONTRACT_ACTIVATED",
    "PROBATION_PACK_GENERATED",
    "PROBATION_DECISION_RECORDED"
  ]
}
EOF

# ── ZIP + SHA ─────────────────────────────────────────────────────────────────
zip -r "${ZIP}" "${OUT_DIR}" > /dev/null
(cd "$(dirname "${ZIP}")" && shasum -a 256 "$(basename "${ZIP}")") > "${ZIP_SHA}"
