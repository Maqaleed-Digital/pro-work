set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PRINCIPALS_FILE="${PRINCIPALS_FILE:-${ROOT}/app/data/admin_principals.json}"
API="${API:-http://127.0.0.1:3010}"

echo "API=${API}"
echo "PRINCIPALS_FILE=${PRINCIPALS_FILE}"

read_role_token() {
  local role="$1"
  PF="${PRINCIPALS_FILE}" ROLE="${role}" node -e '
const fs=require("fs");
const p=process.env.PF;
const role=process.env.ROLE;
const j=JSON.parse(fs.readFileSync(p,"utf8"));
const arr=Array.isArray(j)?j:(Array.isArray(j.principals)?j.principals:(Array.isArray(j.items)?j.items:[]));
const hit=arr.find(x=>String((x&&x.role)||"")===String(role));
process.stdout.write(hit && hit.token ? String(hit.token) : "");
'
}

read_principals_count() {
  PF="${PRINCIPALS_FILE}" node -e '
const fs=require("fs");
const p=process.env.PF;
const j=JSON.parse(fs.readFileSync(p,"utf8"));
const arr=Array.isArray(j)?j:(Array.isArray(j.principals)?j.principals:(Array.isArray(j.items)?j.items:[]));
process.stdout.write(String(arr.length));
'
}

http_raw() {
  local method="$1"
  local url="$2"
  local auth="${3:-}"
  local body="${4:-}"

  if [ -n "${body}" ]; then
    if [ -n "${auth}" ]; then
      curl -sS -i -X "${method}" "${url}" \
        -H "Authorization: Bearer ${auth}" \
        -H "content-type: application/json" \
        -d "${body}"
    else
      curl -sS -i -X "${method}" "${url}" \
        -H "content-type: application/json" \
        -d "${body}"
    fi
  else
    if [ -n "${auth}" ]; then
      curl -sS -i -X "${method}" "${url}" \
        -H "Authorization: Bearer ${auth}"
    else
      curl -sS -i -X "${method}" "${url}"
    fi
  fi
}

extract_http_status() {
  awk 'BEGIN{c=""} /^HTTP\//{c=$2} END{print c}'
}

print_head() {
  sed -n '1,18p' | cat
}

assert_status() {
  local label="$1"
  local expect="$2"
  local got="$3"
  if [ "${got}" != "${expect}" ]; then
    echo "FAIL: ${label} expected HTTP ${expect} but got HTTP ${got}"
    exit 1
  fi
  echo "PASS: ${label} HTTP ${got}"
}

ensure_seeded() {
  local n
  n="$(read_principals_count)"
  if [ "${n}" != "0" ]; then
    echo "SEED: principals present (count=${n})"
    return 0
  fi

  local bootstrap="${ADMIN_BOOTSTRAP_TOKEN:-}"
  if [ -z "${bootstrap}" ]; then
    echo "ERROR: principals empty and ADMIN_BOOTSTRAP_TOKEN not set."
    echo "PRINCIPALS_FILE=${PRINCIPALS_FILE}"
    exit 1
  fi

  echo "SEED: principals empty, bootstrapping superadmin via /api/admin/bootstrap/superadmin"

  local resp st
  resp="$(http_raw "POST" "${API}/api/admin/bootstrap/superadmin" "${bootstrap}" "{\"name\":\"bootstrap-superadmin\"}")"
  echo "${resp}" | print_head
  st="$(echo "${resp}" | extract_http_status)"

  if [ "${st}" != "201" ] && [ "${st}" != "409" ]; then
    echo "ERROR: bootstrap failed with HTTP ${st}"
    exit 1
  fi

  local super
  super="$(read_role_token "superadmin")"
  if [ -z "${super}" ]; then
    echo "ERROR: could not resolve superadmin token after bootstrap."
    echo "PRINCIPALS_FILE=${PRINCIPALS_FILE}"
    exit 1
  fi

  echo "SEED: creating ops principal"
  resp="$(http_raw "POST" "${API}/api/admin/principals" "${super}" "{\"name\":\"seed-ops\",\"role\":\"ops\"}")"
  echo "${resp}" | print_head
  st="$(echo "${resp}" | extract_http_status)"
  if [ "${st}" != "201" ] && [ "${st}" != "409" ]; then
    echo "ERROR: seed ops failed with HTTP ${st}"
    exit 1
  fi

  echo "SEED: creating auditor principal"
  resp="$(http_raw "POST" "${API}/api/admin/principals" "${super}" "{\"name\":\"seed-auditor\",\"role\":\"auditor\"}")"
  echo "${resp}" | print_head
  st="$(echo "${resp}" | extract_http_status)"
  if [ "${st}" != "201" ] && [ "${st}" != "409" ]; then
    echo "ERROR: seed auditor failed with HTTP ${st}"
    exit 1
  fi

  echo "SEED: done"
}

ensure_seeded

SUPER="${SUPER:-$(read_role_token "superadmin")}"
OPERATOR="${OPERATOR:-$(read_role_token "ops")}"
VIEWER="${VIEWER:-$(read_role_token "auditor")}"

if [ -z "${SUPER}" ] || [ -z "${OPERATOR}" ] || [ -z "${VIEWER}" ]; then
  echo "ERROR: could not resolve tokens."
  echo "PRINCIPALS_FILE=${PRINCIPALS_FILE}"
  echo "Resolved lengths: superadmin=${#SUPER} operator=${#OPERATOR} viewer=${#VIEWER}"
  echo "Fix principals file roles or pass SUPER/OPERATOR/VIEWER env vars."
  exit 1
fi

echo "TEST1 no token /stats (expect 401)"
resp="$(http_raw "GET" "${API}/api/admin/stats" "" "")"
echo "${resp}" | print_head
st="$(echo "${resp}" | extract_http_status)"
assert_status "TEST1" "401" "${st}"

echo "TEST2 invalid token /stats (expect 403)"
resp="$(http_raw "GET" "${API}/api/admin/stats" "invalid-token" "")"
echo "${resp}" | print_head
st="$(echo "${resp}" | extract_http_status)"
assert_status "TEST2" "403" "${st}"

echo "TEST3 superadmin /stats (expect 200)"
resp="$(http_raw "GET" "${API}/api/admin/stats" "${SUPER}" "")"
echo "${resp}" | print_head
st="$(echo "${resp}" | extract_http_status)"
assert_status "TEST3" "200" "${st}"

echo "TEST4 auditor /workers (expect 403)"
resp="$(http_raw "GET" "${API}/api/admin/workers" "${VIEWER}" "")"
echo "${resp}" | print_head
st="$(echo "${resp}" | extract_http_status)"
assert_status "TEST4" "403" "${st}"

echo "TEST5 ops /workers (expect 200)"
resp="$(http_raw "GET" "${API}/api/admin/workers" "${OPERATOR}" "")"
echo "${resp}" | print_head
st="$(echo "${resp}" | extract_http_status)"
assert_status "TEST5" "200" "${st}"

echo "TEST6 ops /principals (expect 403)"
resp="$(http_raw "GET" "${API}/api/admin/principals" "${OPERATOR}" "")"
echo "${resp}" | print_head
st="$(echo "${resp}" | extract_http_status)"
assert_status "TEST6" "403" "${st}"

echo "TEST7 superadmin /principals (expect 200)"
resp="$(http_raw "GET" "${API}/api/admin/principals" "${SUPER}" "")"
echo "${resp}" | print_head
st="$(echo "${resp}" | extract_http_status)"
assert_status "TEST7" "200" "${st}"

echo "TEST8 create principal (expect 201)"
resp="$(http_raw "POST" "${API}/api/admin/principals" "${SUPER}" "{\"name\":\"conformance-${RANDOM}\",\"role\":\"ops\"}")"
echo "${resp}" | print_head
st="$(echo "${resp}" | extract_http_status)"
assert_status "TEST8" "201" "${st}"

echo "ALL TESTS PASSED"
