#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
APP_ROOT="${ROOT}/app"

TS="$(date -u +%Y%m%dT%H%M%SZ)"
EVID_ROOT="${ROOT}/evidence/sprintS6/${TS}"
mkdir -p "${EVID_ROOT}"

SUMMARY="${EVID_ROOT}/S6_NEXT3_MOVES_SUMMARY.md"

APP_PORT="${APP_PORT:-3010}"
BASE_URL="http://127.0.0.1:${APP_PORT}"

install_ok=false
lint_ok=false
typecheck_ok=false
test_ok=false
health_ok=false
i18n_en_ok=false
i18n_ar_ok=false
locale_parity_ok=false
loop_ok=false

STEP=""

fail() {
  echo "FAIL: ${STEP}" >&2
  exit 1
}

write_summary() {
  {
    echo "ProWork — Sprint S6 Next 3 Moves Evidence Summary"
    echo
    echo "Timestamp (UTC): ${TS}"
    echo "Repo Path: ${ROOT}"
    echo "App Path: ${APP_ROOT}"
    echo
    echo "Runtime:"
    echo
    echo "APP_PORT=${APP_PORT}"
    echo "BASE_URL=${BASE_URL}"
    echo
    echo "Checks:"
    echo
    echo "install_ok=${install_ok}"
    echo "lint_ok=${lint_ok}"
    echo "typecheck_ok=${typecheck_ok}"
    echo "test_ok=${test_ok}"
    echo "health_ok=${health_ok}"
    echo "i18n_en_ok=${i18n_en_ok}"
    echo "i18n_ar_ok=${i18n_ar_ok}"
    echo "locale_parity_ok=${locale_parity_ok}"
    echo "loop_ok=${loop_ok}"
    echo
    echo "Evidence folder: ${EVID_ROOT}"
  } > "${SUMMARY}"
}

echo "ROOT=${ROOT}"
echo "APP_ROOT=${APP_ROOT}"
echo "EVID_ROOT=${EVID_ROOT}"

STEP="repo_info"
mkdir -p "${EVID_ROOT}/meta"
{
  echo "TS=${TS}"
  echo "ROOT=${ROOT}"
  echo "APP_ROOT=${APP_ROOT}"
  echo "APP_PORT=${APP_PORT}"
  echo "BASE_URL=${BASE_URL}"
  echo "NODE=$(node -v 2>/dev/null || true)"
  echo "PNPM=$(pnpm -v 2>/dev/null || true)"
  echo "GIT=$(cd "${ROOT}" && git rev-parse --short HEAD 2>/dev/null || true)"
} > "${EVID_ROOT}/meta/env.txt"

STEP="scan_s6_docs"
rg -n --hidden --glob '!**/node_modules/**' 'Sprint\s*S6|\bS6\b|i18n|I18N|locales|RTL|Arabic|العربية' "${ROOT}" > "${EVID_ROOT}/meta/s6_doc_hits.txt" 2>&1 || true

STEP="install"
cd "${APP_ROOT}"
if pnpm install > "${EVID_ROOT}/pnpm_install.txt" 2>&1; then
  install_ok=true
else
  install_ok=false
fi

STEP="lint_typecheck_test"
if pnpm -s run lint > "${EVID_ROOT}/pnpm_lint.txt" 2>&1; then
  lint_ok=true
else
  lint_ok=false
fi

if pnpm -s run typecheck > "${EVID_ROOT}/pnpm_typecheck.txt" 2>&1; then
  typecheck_ok=true
else
  typecheck_ok=false
fi

if pnpm -s run test > "${EVID_ROOT}/pnpm_test.txt" 2>&1; then
  test_ok=true
else
  test_ok=false
fi

STEP="health_probe"
mkdir -p "${EVID_ROOT}/health"

curl -sS "${BASE_URL}/health" > "${EVID_ROOT}/health/health.json" 2>&1 || true
curl -sS "${BASE_URL}/api/health" > "${EVID_ROOT}/health/api_health.json" 2>&1 || true

if rg -q '"ok"\s*:\s*true' "${EVID_ROOT}/health/health.json" && rg -q '"ok"\s*:\s*true' "${EVID_ROOT}/health/api_health.json"; then
  health_ok=true
else
  health_ok=false
fi

STEP="i18n_ping_probe"
mkdir -p "${EVID_ROOT}/i18n"

curl -sS "${BASE_URL}/api/i18n/ping" > "${EVID_ROOT}/i18n/ping_en.json" 2>&1 || true
curl -sS "${BASE_URL}/api/i18n/ping" -H "x-locale: ar" > "${EVID_ROOT}/i18n/ping_ar.json" 2>&1 || true

if rg -q '"ok"\s*:\s*true' "${EVID_ROOT}/i18n/ping_en.json" && rg -q '"locale"\s*:\s*"en"' "${EVID_ROOT}/i18n/ping_en.json"; then
  i18n_en_ok=true
else
  i18n_en_ok=false
fi

if rg -q '"ok"\s*:\s*true' "${EVID_ROOT}/i18n/ping_ar.json" && rg -q '"locale"\s*:\s*"ar"' "${EVID_ROOT}/i18n/ping_ar.json"; then
  i18n_ar_ok=true
else
  i18n_ar_ok=false
fi

STEP="locale_parity_check"
mkdir -p "${EVID_ROOT}/locale"

cd "${ROOT}"
node > "${EVID_ROOT}/locale/locale_parity.json" 2>&1 <<'NODE'
const fs = require("fs");
const path = require("path");

const root = process.cwd();
const appRoot = path.join(root, "app");
const enDir = path.join(appRoot, "locales", "en");
const arDir = path.join(appRoot, "locales", "ar");

function readJson(p) {
  const raw = fs.readFileSync(p, "utf8");
  return JSON.parse(raw);
}

function keys(obj, prefix = "") {
  const out = [];
  for (const k of Object.keys(obj)) {
    const v = obj[k];
    const full = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === "object" && !Array.isArray(v)) {
      out.push(...keys(v, full));
    } else {
      out.push(full);
    }
  }
  out.sort();
  return out;
}

function listJsonFiles(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter(f => f.endsWith(".json")).sort();
}

const enFiles = listJsonFiles(enDir);
const arFiles = listJsonFiles(arDir);

const missingInArFiles = enFiles.filter(f => !arFiles.includes(f));
const extraInArFiles = arFiles.filter(f => !enFiles.includes(f));

const perFile = [];
let ok = true;

for (const f of enFiles) {
  const enPath = path.join(enDir, f);
  const arPath = path.join(arDir, f);

  if (!fs.existsSync(arPath)) {
    ok = false;
    perFile.push({ file: f, ok: false, reason: "missing_ar_file" });
    continue;
  }

  const enObj = readJson(enPath);
  const arObj = readJson(arPath);

  const enKeys = keys(enObj);
  const arKeys = keys(arObj);

  const missingKeys = enKeys.filter(k => !arKeys.includes(k));
  const extraKeys = arKeys.filter(k => !enKeys.includes(k));

  const fileOk = missingKeys.length === 0 && extraKeys.length === 0;
  if (!fileOk) ok = false;

  perFile.push({
    file: f,
    ok: fileOk,
    en_key_count: enKeys.length,
    ar_key_count: arKeys.length,
    missing_keys_in_ar: missingKeys,
    extra_keys_in_ar: extraKeys
  });
}

const report = {
  ok,
  en_files: enFiles,
  ar_files: arFiles,
  missing_in_ar_files: missingInArFiles,
  extra_in_ar_files: extraInArFiles,
  per_file: perFile
};

process.stdout.write(JSON.stringify(report, null, 2));
NODE

if rg -q '"ok"\s*:\s*true' "${EVID_ROOT}/locale/locale_parity.json"; then
  locale_parity_ok=true
else
  locale_parity_ok=false
fi

STEP="marketplace_loop_probe"
mkdir -p "${EVID_ROOT}/loop"

JOB_JSON="${EVID_ROOT}/loop/01_job.json"
APPLY_JSON="${EVID_ROOT}/loop/02_apply.json"
ACCEPT_JSON="${EVID_ROOT}/loop/03_accept.json"
COMPLETE_JSON="${EVID_ROOT}/loop/04_complete.json"
PAYOUT_JSON="${EVID_ROOT}/loop/05_payout.json"
IDS_ENV="${EVID_ROOT}/loop/ids.env"

curl -sS -X POST "${BASE_URL}/api/loop/job" \
  -H "Content-Type: application/json" \
  -d '{"title":"S6 Test Job","budget":100,"currency":"USD"}' > "${JOB_JSON}" 2>&1 || true

JOB_ID="$(node -e 'try{const j=require(process.argv[1]); console.log(j.job_id||"")}catch(e){console.log("")}' "${JOB_JSON}")"

if [ -z "${JOB_ID}" ]; then
  loop_ok=false
else
  curl -sS -X POST "${BASE_URL}/api/loop/apply" \
    -H "Content-Type: application/json" \
    -d "{\"job_id\":\"${JOB_ID}\",\"seller_id\":\"seller_demo\",\"price\":100}" > "${APPLY_JSON}" 2>&1 || true

  APP_ID="$(node -e 'try{const j=require(process.argv[1]); console.log(j.application_id||"")}catch(e){console.log("")}' "${APPLY_JSON}")"

  if [ -z "${APP_ID}" ]; then
    loop_ok=false
  else
    curl -sS -X POST "${BASE_URL}/api/loop/accept" \
      -H "Content-Type: application/json" \
      -d "{\"job_id\":\"${JOB_ID}\",\"application_id\":\"${APP_ID}\"}" > "${ACCEPT_JSON}" 2>&1 || true

    curl -sS -X POST "${BASE_URL}/api/loop/complete" \
      -H "Content-Type: application/json" \
      -d "{\"job_id\":\"${JOB_ID}\"}" > "${COMPLETE_JSON}" 2>&1 || true

    curl -sS -X POST "${BASE_URL}/api/loop/payout" \
      -H "Content-Type: application/json" \
      -d "{\"job_id\":\"${JOB_ID}\",\"amount\":100,\"currency\":\"USD\"}" > "${PAYOUT_JSON}" 2>&1 || true

    if rg -q '"ok"\s*:\s*true' "${PAYOUT_JSON}" && rg -q '"payout_id"\s*:\s*"' "${PAYOUT_JSON}"; then
      loop_ok=true
    else
      loop_ok=false
    fi

    {
      echo "JOB_ID=${JOB_ID}"
      echo "APP_ID=${APP_ID}"
    } > "${IDS_ENV}"
  fi
fi

STEP="write_summary"
write_summary

echo "DONE: ${EVID_ROOT}"

STEP="final_gate"
if [ "${install_ok}" = "true" ] && [ "${lint_ok}" = "true" ] && [ "${typecheck_ok}" = "true" ] && [ "${test_ok}" = "true" ] && [ "${health_ok}" = "true" ] && [ "${i18n_en_ok}" = "true" ] && [ "${i18n_ar_ok}" = "true" ] && [ "${locale_parity_ok}" = "true" ] && [ "${loop_ok}" = "true" ]; then
  exit 0
fi

fail
