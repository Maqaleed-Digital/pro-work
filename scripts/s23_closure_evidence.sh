#!/usr/bin/env bash
set -euo pipefail

SPRINT="${SPRINT:-S24}"
TIMESTAMP="$(date -u +"%Y%m%dT%H%M%SZ")"
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
EVIDENCE_DIR="${REPO_ROOT}/evidence/sprint${SPRINT}/${TIMESTAMP}"
API="${API:-http://127.0.0.1:3010}"

ADMIN_SUPERADMIN_TOKEN="${ADMIN_SUPERADMIN_TOKEN:-}"
ADMIN_VIEWER_TOKEN="${ADMIN_VIEWER_TOKEN:-}"

mkdir -p "${EVIDENCE_DIR}"
LOG="${EVIDENCE_DIR}/evidence.log"

log() { echo "[$(date -u +%H:%M:%S)] $*" | tee -a "${LOG}"; }
section() { printf "\n=== %s ===\n" "$*" | tee -a "${LOG}"; }

capture_cmd() {
  local name="$1"; shift
  local out="${EVIDENCE_DIR}/${name}.txt"
  {
    echo "\$ $*"
    echo "---"
    "$@" 2>&1 || true
  } > "${out}"
  log "Captured: ${name}"
}

capture_http() {
  local name="$1"; shift
  local out="${EVIDENCE_DIR}/${name}.txt"
  {
    echo "\$ $*"
    echo "---"
    eval "$*" 2>&1 || true
  } > "${out}"
  log "Captured: ${name}"
}

section "SPRINT EVIDENCE REPORT"
{
  echo "Sprint: ${SPRINT}"
  echo "Timestamp: ${TIMESTAMP}"
  echo "Repo: ${REPO_ROOT}"
  echo "API: ${API}"
  echo "Output: ${EVIDENCE_DIR}"
} | tee -a "${LOG}"

section "GIT CONTEXT"
capture_cmd "git_branch" git -C "${REPO_ROOT}" branch --show-current
capture_cmd "git_log" git -C "${REPO_ROOT}" log --oneline -20
capture_cmd "git_status" git -C "${REPO_ROOT}" status --short
capture_cmd "git_remote" git -C "${REPO_ROOT}" remote -v

section "NODE CONTEXT"
capture_cmd "node_version" node -v
capture_cmd "npm_version" npm -v

section "APP CHECKS"
APP_DIR="${REPO_ROOT}/app"
if [ ! -d "${APP_DIR}" ]; then
  log "app_dir_missing=true"
  printf "app_dir_missing=true\n" > "${EVIDENCE_DIR}/app_missing.txt"
  exit 1
fi

cd "${APP_DIR}"
if npm ci > "${EVIDENCE_DIR}/npm_ci.txt" 2>&1; then
  log "npm_ci=ok"
else
  log "npm_ci=fail"
fi

if npm run lint > "${EVIDENCE_DIR}/lint.txt" 2>&1; then
  log "lint=ok"
else
  log "lint=fail"
fi

if npm run typecheck > "${EVIDENCE_DIR}/typecheck.txt" 2>&1; then
  log "typecheck=ok"
else
  log "typecheck=fail_or_skipped"
fi

if npm test > "${EVIDENCE_DIR}/test.txt" 2>&1; then
  log "test=ok"
else
  log "test=fail"
fi

section "HEALTH CHECK"
HEALTH_BODY_AND_CODE="$(curl -sS -w "\nHTTP:%{http_code}" "${API}/health" 2>/dev/null || true)"
printf "%s\n" "${HEALTH_BODY_AND_CODE}" > "${EVIDENCE_DIR}/health.txt"
if printf "%s" "${HEALTH_BODY_AND_CODE}" | grep -q "HTTP:200"; then
  log "health_http=200"
else
  log "health_http!=200_or_unreachable"
fi

section "ADMIN ENDPOINT DISCOVERY"
GOV_PATH=""
STATS_PATH=""

GOV_CODE_1="$(curl -s -o /dev/null -w "%{http_code}" "${API}/admin/governance" 2>/dev/null || true)"
GOV_CODE_2="$(curl -s -o /dev/null -w "%{http_code}" "${API}/api/admin/governance" 2>/dev/null || true)"
if [ "${GOV_CODE_1}" != "" ] && [ "${GOV_CODE_1}" != "000" ] && [ "${GOV_CODE_1}" != "404" ]; then GOV_PATH="/admin/governance"; fi
if [ -z "${GOV_PATH}" ] && [ "${GOV_CODE_2}" != "" ] && [ "${GOV_CODE_2}" != "000" ] && [ "${GOV_CODE_2}" != "404" ]; then GOV_PATH="/api/admin/governance"; fi

STATS_CODE_1="$(curl -s -o /dev/null -w "%{http_code}" "${API}/admin/stats" 2>/dev/null || true)"
STATS_CODE_2="$(curl -s -o /dev/null -w "%{http_code}" "${API}/api/admin/stats" 2>/dev/null || true)"
if [ "${STATS_CODE_1}" != "" ] && [ "${STATS_CODE_1}" != "000" ] && [ "${STATS_CODE_1}" != "404" ]; then STATS_PATH="/admin/stats"; fi
if [ -z "${STATS_PATH}" ] && [ "${STATS_CODE_2}" != "" ] && [ "${STATS_CODE_2}" != "000" ] && [ "${STATS_CODE_2}" != "404" ]; then STATS_PATH="/api/admin/stats"; fi

{
  echo "gov_probe_/admin/governance_http=${GOV_CODE_1}"
  echo "gov_probe_/api/admin/governance_http=${GOV_CODE_2}"
  echo "stats_probe_/admin/stats_http=${STATS_CODE_1}"
  echo "stats_probe_/api/admin/stats_http=${STATS_CODE_2}"
  echo "gov_selected_path=${GOV_PATH:-NONE}"
  echo "stats_selected_path=${STATS_PATH:-NONE}"
} | tee "${EVIDENCE_DIR}/admin_discovery.txt" >/dev/null

section "ADMIN GOVERNANCE SMOKE"
if [ -n "${GOV_PATH}" ]; then
  if [ -n "${ADMIN_SUPERADMIN_TOKEN}" ]; then
    capture_http "admin_governance_superadmin" "curl -sS -w '\nHTTP:%{http_code}' -H \"Authorization: Bearer ${ADMIN_SUPERADMIN_TOKEN}\" \"${API}${GOV_PATH}\""
    GOV_CODE="$(tail -n 1 "${EVIDENCE_DIR}/admin_governance_superadmin.txt" | sed 's/HTTP://')"
    log "admin_governance_superadmin_http=${GOV_CODE}"
  else
    capture_http "admin_governance_no_token" "curl -sS -w '\nHTTP:%{http_code}' \"${API}${GOV_PATH}\""
    GOV_CODE="$(tail -n 1 "${EVIDENCE_DIR}/admin_governance_no_token.txt" | sed 's/HTTP://')"
    log "admin_governance_no_token_http=${GOV_CODE}"
  fi
else
  printf "admin_governance=not_found\n" > "${EVIDENCE_DIR}/admin_governance.txt"
  log "admin_governance=not_found"
fi

section "ADMIN STATS SMOKE"
if [ -n "${STATS_PATH}" ]; then
  if [ -n "${ADMIN_SUPERADMIN_TOKEN}" ]; then
    capture_http "admin_stats_superadmin" "curl -sS -w '\nHTTP:%{http_code}' -H \"Authorization: Bearer ${ADMIN_SUPERADMIN_TOKEN}\" \"${API}${STATS_PATH}\""
    STATS_CODE="$(tail -n 1 "${EVIDENCE_DIR}/admin_stats_superadmin.txt" | sed 's/HTTP://')"
    log "admin_stats_superadmin_http=${STATS_CODE}"
  else
    capture_http "admin_stats_no_token" "curl -sS -w '\nHTTP:%{http_code}' \"${API}${STATS_PATH}\""
    STATS_CODE="$(tail -n 1 "${EVIDENCE_DIR}/admin_stats_no_token.txt" | sed 's/HTTP://')"
    log "admin_stats_no_token_http=${STATS_CODE}"
  fi
else
  printf "admin_stats=not_found\n" > "${EVIDENCE_DIR}/admin_stats.txt"
  log "admin_stats=not_found"
fi

section "RBAC SPOT CHECK"
RBAC_401="000"
RBAC_403="000"

if [ -n "${STATS_PATH}" ]; then
  RBAC_401="$(curl -s -o /dev/null -w "%{http_code}" "${API}${STATS_PATH}" 2>/dev/null || true)"
fi

if [ -n "${ADMIN_VIEWER_TOKEN}" ]; then
  WORKERS_PATH="/admin/workers"
  WORKERS_CODE_1="$(curl -s -o /dev/null -w "%{http_code}" -H "Authorization: Bearer ${ADMIN_VIEWER_TOKEN}" "${API}/admin/workers" 2>/dev/null || true)"
  WORKERS_CODE_2="$(curl -s -o /dev/null -w "%{http_code}" -H "Authorization: Bearer ${ADMIN_VIEWER_TOKEN}" "${API}/api/admin/workers" 2>/dev/null || true)"
  if [ "${WORKERS_CODE_1}" != "404" ] && [ "${WORKERS_CODE_1}" != "000" ] && [ "${WORKERS_CODE_1}" != "" ]; then
    WORKERS_PATH="/admin/workers"
  elif [ "${WORKERS_CODE_2}" != "404" ] && [ "${WORKERS_CODE_2}" != "000" ] && [ "${WORKERS_CODE_2}" != "" ]; then
    WORKERS_PATH="/api/admin/workers"
  else
    WORKERS_PATH=""
  fi

  if [ -n "${WORKERS_PATH}" ]; then
    RBAC_403="$(curl -s -o /dev/null -w "%{http_code}" -H "Authorization: Bearer ${ADMIN_VIEWER_TOKEN}" "${API}${WORKERS_PATH}" 2>/dev/null || true)"
  fi
fi

{
  echo "stats_path=${STATS_PATH:-NONE}"
  echo "stats_no_token_http=${RBAC_401}"
  echo "workers_viewer_token_set=$([ -n "${ADMIN_VIEWER_TOKEN}" ] && echo true || echo false)"
  echo "workers_viewer_http=${RBAC_403}"
} > "${EVIDENCE_DIR}/rbac_spot_check.txt"

log "rbac_401_http=${RBAC_401}"
log "rbac_403_http=${RBAC_403}"

section "SUMMARY"
log "Evidence folder: ${EVIDENCE_DIR}"
ls -la "${EVIDENCE_DIR}" >> "${LOG}" || true
printf "evidence_out=%s\n" "${EVIDENCE_DIR}" > "${EVIDENCE_DIR}/99_done.txt"
log "Attach to Notion: ${EVIDENCE_DIR}"
