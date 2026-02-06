set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PRINCIPALS_FILE="${PRINCIPALS_FILE:-${ROOT}/app/data/admin_principals.json}"
API="${API:-http://127.0.0.1:3010}"

echo "======================================"
echo "S22 Admin RBAC Conformance Tests"
echo "API: ${API}"
echo "PRINCIPALS_FILE: ${PRINCIPALS_FILE}"
echo "======================================"
echo ""

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
  local auth_header="${3:-}"
  local body="${4:-}"

  if [ -n "${body}" ]; then
    if [ -n "${auth_header}" ]; then
      curl -sS -i -X "${method}" "${url}" -H "${auth_header}" -H "content-type: application/json" -d "${body}"
    else
      curl -sS -i -X "${method}" "${url}" -H "content-type: application/json" -d "${body}"
    fi
  else
    if [ -n "${auth_header}" ]; then
      curl -sS -i -X "${method}" "${url}" -H "${auth_header}"
    else
      curl -sS -i -X "${method}" "${url}"
    fi
  fi
}

extract_http_status() {
  awk 'BEGIN{c=""} /^HTTP\//{c=$2} END{print c}'
}

extract_body() {
  awk 'BEGIN{s=0} s==1{print} /^\r?$/{s=1}'
}

assert_status() {
  local label="$1"
  local expect="$2"
  local got="$3"
  if [ "${got}" != "${expect}" ]; then
    echo "❌ FAIL: ${label} expected HTTP ${expect} got HTTP ${got}"
    exit 1
  fi
  echo "✅ PASS: ${label} (HTTP ${got})"
}

assert_json_shape_ok_or_err() {
  local label="$1"
  local raw="$2"

  echo "${raw}" | extract_body | node -e '
let s=""; process.stdin.on("data",d=>s+=d); process.stdin.on("end",()=>{
  s = String(s||"").trim();
  if(!s){ console.error("EMPTY_BODY"); process.exit(2); }
  let j=null;
  try{ j=JSON.parse(s); }catch(e){ console.error("NOT_JSON"); process.exit(2); }
  if(j.ok===true && ("data" in j)) process.exit(0);
  if(j.ok===false && j.error && typeof j.error.code==="string" && typeof j.error.message==="string") process.exit(0);
  console.error("BAD_SHAPE");
  process.exit(2);
});
' >/dev/null 2>&1 || { echo "❌ FAIL: ${label} response format incorrect"; exit 1; }

  echo "✅ PASS: ${label} response format is correct"
}

ensure_seeded() {
  local n
  n="$(read_principals_count)"
  if [ "${n}" != "0" ]; then
    return 0
  fi

  local bootstrap="${ADMIN_BOOTSTRAP_TOKEN:-}"
  if [ -z "${bootstrap}" ]; then
    echo "ERROR: principals empty and ADMIN_BOOTSTRAP_TOKEN not set."
    exit 1
  fi

  echo "SEED: principals empty, bootstrapping superadmin via /api/admin/bootstrap/superadmin"
  local resp st
  resp="$(http_raw "POST" "${API}/api/admin/bootstrap/superadmin" "Authorization: Bearer ${bootstrap}" "{\"name\":\"bootstrap-superadmin\"}")"
  st="$(echo "${resp}" | extract_http_status)"
  if [ "${st}" != "201" ] && [ "${st}" != "409" ]; then
    echo "${resp}" | sed -n '1,18p' | cat
    echo "ERROR: bootstrap failed with HTTP ${st}"
    exit 1
  fi

  local super
  super="$(read_role_token "superadmin")"
  if [ -z "${super}" ]; then
    echo "ERROR: could not resolve superadmin token after bootstrap."
    exit 1
  fi

  http_raw "POST" "${API}/api/admin/principals" "Authorization: Bearer ${super}" "{\"name\":\"seed-ops\",\"role\":\"ops\"}" >/dev/null 2>&1 || true
  http_raw "POST" "${API}/api/admin/principals" "Authorization: Bearer ${super}" "{\"name\":\"seed-auditor\",\"role\":\"auditor\"}" >/dev/null 2>&1 || true
}

ensure_seeded

SUPER="${SUPER:-$(read_role_token "superadmin")}"
OPERATOR="${OPERATOR:-$(read_role_token "ops")}"
VIEWER="${VIEWER:-$(read_role_token "auditor")}"

if [ -z "${SUPER}" ] || [ -z "${OPERATOR}" ] || [ -z "${VIEWER}" ]; then
  echo "ERROR: could not resolve tokens."
  echo "Resolved lengths: superadmin=${#SUPER} operator=${#OPERATOR} viewer=${#VIEWER}"
  exit 1
fi

echo "--- 401 UNAUTHORIZED Tests ---"
resp="$(http_raw "GET" "${API}/api/admin/stats" "" "")"
st="$(echo "${resp}" | extract_http_status)"
assert_status "GET /api/admin/stats (no token)" "401" "${st}"

resp="$(http_raw "GET" "${API}/api/admin/stats" "Authorization: Bearer invalid-token" "")"
st="$(echo "${resp}" | extract_http_status)"
assert_status "GET /api/admin/stats (invalid token)" "401" "${st}"

resp="$(http_raw "GET" "${API}/api/admin/stats" "Authorization: Basic Zm9vOmJhcg==" "")"
st="$(echo "${resp}" | extract_http_status)"
assert_status "GET /api/admin/stats (Basic instead of Bearer)" "401" "${st}"
echo ""

echo "--- 403 FORBIDDEN Tests ---"
resp="$(http_raw "GET" "${API}/api/admin/workers" "Authorization: Bearer ${VIEWER}" "")"
st="$(echo "${resp}" | extract_http_status)"
assert_status "GET /api/admin/workers (viewer token - lacks 'workers')" "403" "${st}"

resp="$(http_raw "GET" "${API}/api/admin/governance" "Authorization: Bearer ${VIEWER}" "")"
st="$(echo "${resp}" | extract_http_status)"
assert_status "GET /api/admin/governance (viewer token - lacks 'governance')" "403" "${st}"

resp="$(http_raw "GET" "${API}/api/admin/pods" "Authorization: Bearer ${VIEWER}" "")"
st="$(echo "${resp}" | extract_http_status)"
assert_status "GET /api/admin/pods (viewer token - lacks 'pods')" "403" "${st}"

resp="$(http_raw "GET" "${API}/api/admin/principals" "Authorization: Bearer ${OPERATOR}" "")"
st="$(echo "${resp}" | extract_http_status)"
assert_status "GET /api/admin/principals (operator token - lacks 'principals')" "403" "${st}"
echo ""

echo "--- 200 OK Tests ---"
resp="$(http_raw "GET" "${API}/api/admin/stats" "Authorization: Bearer ${SUPER}" "")"
st="$(echo "${resp}" | extract_http_status)"
assert_status "GET /api/admin/stats (superadmin)" "200" "${st}"

resp="$(http_raw "GET" "${API}/api/admin/governance" "Authorization: Bearer ${SUPER}" "")"
st="$(echo "${resp}" | extract_http_status)"
assert_status "GET /api/admin/governance (superadmin)" "200" "${st}"

resp="$(http_raw "GET" "${API}/api/admin/workers" "Authorization: Bearer ${SUPER}" "")"
st="$(echo "${resp}" | extract_http_status)"
assert_status "GET /api/admin/workers (superadmin)" "200" "${st}"

resp="$(http_raw "GET" "${API}/api/admin/pods" "Authorization: Bearer ${SUPER}" "")"
st="$(echo "${resp}" | extract_http_status)"
assert_status "GET /api/admin/pods (superadmin)" "200" "${st}"

resp="$(http_raw "GET" "${API}/api/admin/principals" "Authorization: Bearer ${SUPER}" "")"
st="$(echo "${resp}" | extract_http_status)"
assert_status "GET /api/admin/principals (superadmin)" "200" "${st}"

resp="$(http_raw "GET" "${API}/api/admin/stats" "Authorization: Bearer ${OPERATOR}" "")"
st="$(echo "${resp}" | extract_http_status)"
assert_status "GET /api/admin/stats (operator)" "200" "${st}"

resp="$(http_raw "GET" "${API}/api/admin/workers" "Authorization: Bearer ${OPERATOR}" "")"
st="$(echo "${resp}" | extract_http_status)"
assert_status "GET /api/admin/workers (operator)" "200" "${st}"

resp="$(http_raw "GET" "${API}/api/admin/stats" "Authorization: Bearer ${VIEWER}" "")"
st="$(echo "${resp}" | extract_http_status)"
assert_status "GET /api/admin/stats (viewer)" "200" "${st}"
echo ""

echo "--- 201 CREATED Tests ---"
resp="$(http_raw "POST" "${API}/api/admin/principals" "Authorization: Bearer ${SUPER}" "{\"name\":\"conformance-${RANDOM}\",\"role\":\"ops\"}")"
st="$(echo "${resp}" | extract_http_status)"
assert_status "POST /api/admin/principals (superadmin creates principal)" "201" "${st}"
echo ""

echo "--- Response Format Tests ---"
resp="$(http_raw "GET" "${API}/api/admin/stats" "" "")"
assert_json_shape_ok_or_err "401 response format" "${resp}"

resp="$(http_raw "GET" "${API}/api/admin/stats" "Authorization: Bearer ${SUPER}" "")"
assert_json_shape_ok_or_err "200 response format" "${resp}"
echo ""

echo "======================================"
echo "RESULTS: 18 passed, 0 failed"
echo "======================================"
