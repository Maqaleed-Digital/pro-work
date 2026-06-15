#!/usr/bin/env bash
set -euo pipefail

fail() {
  echo "ERROR: $*" >&2
  exit 1
}

require_cmd() {
  command -v "$1" >/dev/null 2>&1 || fail "Missing required command: $1"
}

require_env() {
  local name="$1"
  [[ -n "${!name:-}" ]] || fail "Required environment variable not set: $name"
}

require_cmd curl
require_cmd mkdir
require_cmd tee
require_cmd date

require_env WC_PUBLIC_BASE_URL
require_env WC_HEALTH_PATH
require_env WC_ADMIN_PATH
require_env WC_IDENTITY_PATH
require_env WC_ADMIN_AUTH_HEADER
require_env WC_IDENTITY_AUTH_HEADER

TIMESTAMP="$(date -u +"%Y%m%dT%H%M%SZ")"
EVIDENCE_RUN_DIR="FND/EVIDENCE/WORKCAPTAIN-PHASE-9-AUTH-AND-IDENTITY-CONTROL-LAYER/${TIMESTAMP}"
mkdir -p "${EVIDENCE_RUN_DIR}"

log() {
  echo "[$(date -u +"%Y-%m-%dT%H:%M:%SZ")] $*" | tee -a "${EVIDENCE_RUN_DIR}/decision_log.txt"
}

request_code() {
  local output_file="$1"
  shift
  curl -sS -o "${output_file}" -w "%{http_code}" "$@"
}

log "START Phase 9 auth + identity control layer gate"
log "Base URL=${WC_PUBLIC_BASE_URL}"

HEALTH_URL="${WC_PUBLIC_BASE_URL}${WC_HEALTH_PATH}"
ADMIN_URL="${WC_PUBLIC_BASE_URL}${WC_ADMIN_PATH}"
IDENTITY_URL="${WC_PUBLIC_BASE_URL}${WC_IDENTITY_PATH}"

HEALTH_CODE="$(request_code "${EVIDENCE_RUN_DIR}/health_response.txt" "${HEALTH_URL}")"
echo "${HEALTH_CODE}" > "${EVIDENCE_RUN_DIR}/health_status_code.txt"
[[ "${HEALTH_CODE}" == "200" ]] || fail "Health check must return 200; got ${HEALTH_CODE}"

ADMIN_UNAUTH_CODE="$(request_code "${EVIDENCE_RUN_DIR}/admin_unauth_response.txt" "${ADMIN_URL}")"
echo "${ADMIN_UNAUTH_CODE}" > "${EVIDENCE_RUN_DIR}/admin_unauth_status_code.txt"
[[ "${ADMIN_UNAUTH_CODE}" == "401" || "${ADMIN_UNAUTH_CODE}" == "403" ]] || fail "Unauthenticated admin must return 401 or 403; got ${ADMIN_UNAUTH_CODE}"

IDENTITY_UNAUTH_CODE="$(request_code "${EVIDENCE_RUN_DIR}/identity_unauth_response.txt" "${IDENTITY_URL}")"
echo "${IDENTITY_UNAUTH_CODE}" > "${EVIDENCE_RUN_DIR}/identity_unauth_status_code.txt"
[[ "${IDENTITY_UNAUTH_CODE}" == "401" || "${IDENTITY_UNAUTH_CODE}" == "403" ]] || fail "Unauthenticated identity must return 401 or 403; got ${IDENTITY_UNAUTH_CODE}"

ADMIN_AUTH_CODE="$(request_code "${EVIDENCE_RUN_DIR}/admin_auth_response.txt" -H "${WC_ADMIN_AUTH_HEADER}" "${ADMIN_URL}")"
echo "${ADMIN_AUTH_CODE}" > "${EVIDENCE_RUN_DIR}/admin_auth_status_code.txt"
[[ "${ADMIN_AUTH_CODE}" =~ ^2[0-9][0-9]$ ]] || fail "Authenticated admin must return 2xx; got ${ADMIN_AUTH_CODE}"

IDENTITY_AUTH_CODE="$(request_code "${EVIDENCE_RUN_DIR}/identity_auth_response.txt" -H "${WC_IDENTITY_AUTH_HEADER}" "${IDENTITY_URL}")"
echo "${IDENTITY_AUTH_CODE}" > "${EVIDENCE_RUN_DIR}/identity_auth_status_code.txt"
[[ "${IDENTITY_AUTH_CODE}" =~ ^2[0-9][0-9]$ ]] || fail "Authenticated identity must return 2xx; got ${IDENTITY_AUTH_CODE}"

cat > "${EVIDENCE_RUN_DIR}/MANIFEST.txt" <<EOFMANIFEST
PHASE=WORKCAPTAIN-PHASE-9-AUTH-AND-IDENTITY-CONTROL-LAYER
TIMESTAMP=${TIMESTAMP}
EVIDENCE_RUN_DIR=${EVIDENCE_RUN_DIR}
WC_PUBLIC_BASE_URL=${WC_PUBLIC_BASE_URL}
WC_HEALTH_PATH=${WC_HEALTH_PATH}
WC_ADMIN_PATH=${WC_ADMIN_PATH}
WC_IDENTITY_PATH=${WC_IDENTITY_PATH}
HEALTH_CODE=${HEALTH_CODE}
ADMIN_UNAUTH_CODE=${ADMIN_UNAUTH_CODE}
IDENTITY_UNAUTH_CODE=${IDENTITY_UNAUTH_CODE}
ADMIN_AUTH_CODE=${ADMIN_AUTH_CODE}
IDENTITY_AUTH_CODE=${IDENTITY_AUTH_CODE}
EOFMANIFEST

log "COMPLETE Phase 9 auth + identity control layer gate"
echo "EVIDENCE_RUN_DIR=${EVIDENCE_RUN_DIR}"
