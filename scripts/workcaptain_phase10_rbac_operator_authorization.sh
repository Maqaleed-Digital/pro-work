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
require_env WC_VIEWER_AUTH_HEADER
require_env WC_OPERATOR_AUTH_HEADER
require_env WC_ADMIN_AUTH_HEADER

TIMESTAMP="$(date -u +"%Y%m%dT%H%M%SZ")"
EVIDENCE_RUN_DIR="FND/EVIDENCE/WORKCAPTAIN-PHASE-10-RBAC-OPERATOR-AUTHORIZATION-LAYER/${TIMESTAMP}"
mkdir -p "${EVIDENCE_RUN_DIR}"

log() {
  echo "[$(date -u +"%Y-%m-%dT%H:%M:%SZ")] $*" | tee -a "${EVIDENCE_RUN_DIR}/decision_log.txt"
}

request_code() {
  local output_file="$1"
  shift
  curl -sS -o "${output_file}" -w "%{http_code}" "$@"
}

log "START Phase 10 RBAC + operator authorization layer gate"
log "Base URL=${WC_PUBLIC_BASE_URL}"

HEALTH_URL="${WC_PUBLIC_BASE_URL}${WC_HEALTH_PATH}"
ADMIN_URL="${WC_PUBLIC_BASE_URL}${WC_ADMIN_PATH}"
IDENTITY_URL="${WC_PUBLIC_BASE_URL}${WC_IDENTITY_PATH}"
OPS_PING_URL="${WC_PUBLIC_BASE_URL}/ops/ping"

# 1. /health public → 200
log "CHECK 1: /health public"
HEALTH_CODE="$(request_code "${EVIDENCE_RUN_DIR}/health_response.txt" "${HEALTH_URL}")"
echo "${HEALTH_CODE}" > "${EVIDENCE_RUN_DIR}/health_status_code.txt"
[[ "${HEALTH_CODE}" == "200" ]] || fail "Health check must return 200; got ${HEALTH_CODE}"
log "PASS /health → ${HEALTH_CODE}"

# 2. /admin no token → 401
log "CHECK 2: /admin no token"
ADMIN_UNAUTH_CODE="$(request_code "${EVIDENCE_RUN_DIR}/admin_unauth_response.txt" "${ADMIN_URL}")"
echo "${ADMIN_UNAUTH_CODE}" > "${EVIDENCE_RUN_DIR}/admin_unauth_status_code.txt"
[[ "${ADMIN_UNAUTH_CODE}" == "401" ]] || fail "Unauthenticated admin must return 401; got ${ADMIN_UNAUTH_CODE}"
log "PASS /admin (no token) → ${ADMIN_UNAUTH_CODE}"

# 3. /admin operator token → 403
log "CHECK 3: /admin operator token"
ADMIN_OPERATOR_CODE="$(request_code "${EVIDENCE_RUN_DIR}/admin_operator_response.txt" -H "${WC_OPERATOR_AUTH_HEADER}" "${ADMIN_URL}")"
echo "${ADMIN_OPERATOR_CODE}" > "${EVIDENCE_RUN_DIR}/admin_operator_status_code.txt"
[[ "${ADMIN_OPERATOR_CODE}" == "403" ]] || fail "Operator on /admin must return 403; got ${ADMIN_OPERATOR_CODE}"
log "PASS /admin (operator) → ${ADMIN_OPERATOR_CODE}"

# 4. /admin admin token → 200
log "CHECK 4: /admin admin token"
ADMIN_AUTH_CODE="$(request_code "${EVIDENCE_RUN_DIR}/admin_auth_response.txt" -H "${WC_ADMIN_AUTH_HEADER}" "${ADMIN_URL}")"
echo "${ADMIN_AUTH_CODE}" > "${EVIDENCE_RUN_DIR}/admin_auth_status_code.txt"
[[ "${ADMIN_AUTH_CODE}" =~ ^2[0-9][0-9]$ ]] || fail "Admin on /admin must return 2xx; got ${ADMIN_AUTH_CODE}"
log "PASS /admin (admin) → ${ADMIN_AUTH_CODE}"

# 5. /auth/identity no token → 401
log "CHECK 5: /auth/identity no token"
IDENTITY_UNAUTH_CODE="$(request_code "${EVIDENCE_RUN_DIR}/identity_unauth_response.txt" "${IDENTITY_URL}")"
echo "${IDENTITY_UNAUTH_CODE}" > "${EVIDENCE_RUN_DIR}/identity_unauth_status_code.txt"
[[ "${IDENTITY_UNAUTH_CODE}" == "401" ]] || fail "Unauthenticated identity must return 401; got ${IDENTITY_UNAUTH_CODE}"
log "PASS /auth/identity (no token) → ${IDENTITY_UNAUTH_CODE}"

# 6. /auth/identity viewer token → 200
log "CHECK 6: /auth/identity viewer token"
IDENTITY_AUTH_CODE="$(request_code "${EVIDENCE_RUN_DIR}/identity_auth_response.txt" -H "${WC_VIEWER_AUTH_HEADER}" "${IDENTITY_URL}")"
echo "${IDENTITY_AUTH_CODE}" > "${EVIDENCE_RUN_DIR}/identity_auth_status_code.txt"
[[ "${IDENTITY_AUTH_CODE}" =~ ^2[0-9][0-9]$ ]] || fail "Viewer on /auth/identity must return 2xx; got ${IDENTITY_AUTH_CODE}"
log "PASS /auth/identity (viewer) → ${IDENTITY_AUTH_CODE}"

# 7. /ops/ping no token → 401
log "CHECK 7: /ops/ping no token"
OPS_UNAUTH_CODE="$(request_code "${EVIDENCE_RUN_DIR}/ops_ping_unauth_response.txt" "${OPS_PING_URL}")"
echo "${OPS_UNAUTH_CODE}" > "${EVIDENCE_RUN_DIR}/ops_ping_unauth_status_code.txt"
[[ "${OPS_UNAUTH_CODE}" == "401" ]] || fail "Unauthenticated /ops/ping must return 401; got ${OPS_UNAUTH_CODE}"
log "PASS /ops/ping (no token) → ${OPS_UNAUTH_CODE}"

# 8. /ops/ping viewer token → 403
log "CHECK 8: /ops/ping viewer token"
OPS_VIEWER_CODE="$(request_code "${EVIDENCE_RUN_DIR}/ops_ping_viewer_response.txt" -H "${WC_VIEWER_AUTH_HEADER}" "${OPS_PING_URL}")"
echo "${OPS_VIEWER_CODE}" > "${EVIDENCE_RUN_DIR}/ops_ping_viewer_status_code.txt"
[[ "${OPS_VIEWER_CODE}" == "403" ]] || fail "Viewer on /ops/ping must return 403; got ${OPS_VIEWER_CODE}"
log "PASS /ops/ping (viewer) → ${OPS_VIEWER_CODE}"

# 9. /ops/ping operator token → 200
log "CHECK 9: /ops/ping operator token"
OPS_OPERATOR_CODE="$(request_code "${EVIDENCE_RUN_DIR}/ops_ping_operator_response.txt" -H "${WC_OPERATOR_AUTH_HEADER}" "${OPS_PING_URL}")"
echo "${OPS_OPERATOR_CODE}" > "${EVIDENCE_RUN_DIR}/ops_ping_operator_status_code.txt"
[[ "${OPS_OPERATOR_CODE}" =~ ^2[0-9][0-9]$ ]] || fail "Operator on /ops/ping must return 2xx; got ${OPS_OPERATOR_CODE}"
log "PASS /ops/ping (operator) → ${OPS_OPERATOR_CODE}"

# 10. /admin operator token already proven as 403 (case 3) — source-of-truth commit captured in manifest

SOURCE_COMMIT="$(git -C "$(dirname "$0")/.." rev-parse HEAD 2>/dev/null || echo "unknown")"

cat > "${EVIDENCE_RUN_DIR}/MANIFEST.txt" <<EOFMANIFEST
PHASE=WORKCAPTAIN-PHASE-10-RBAC-OPERATOR-AUTHORIZATION-LAYER
TIMESTAMP=${TIMESTAMP}
EVIDENCE_RUN_DIR=${EVIDENCE_RUN_DIR}
WC_PUBLIC_BASE_URL=${WC_PUBLIC_BASE_URL}
HEALTH_CODE=${HEALTH_CODE}
ADMIN_UNAUTH_CODE=${ADMIN_UNAUTH_CODE}
ADMIN_OPERATOR_CODE=${ADMIN_OPERATOR_CODE}
ADMIN_AUTH_CODE=${ADMIN_AUTH_CODE}
IDENTITY_UNAUTH_CODE=${IDENTITY_UNAUTH_CODE}
IDENTITY_AUTH_CODE=${IDENTITY_AUTH_CODE}
OPS_PING_UNAUTH_CODE=${OPS_UNAUTH_CODE}
OPS_PING_VIEWER_CODE=${OPS_VIEWER_CODE}
OPS_PING_OPERATOR_CODE=${OPS_OPERATOR_CODE}
SOURCE_COMMIT=${SOURCE_COMMIT}
EOFMANIFEST

log "COMPLETE Phase 10 RBAC + operator authorization layer gate"
echo "NEW_SOURCE_OF_TRUTH_COMMIT=${SOURCE_COMMIT}"
echo "EVIDENCE_RUN_DIR=${EVIDENCE_RUN_DIR}"
