set -eu

API="${API:-http://127.0.0.1:3010}"

SUPER="${SUPER:-sk-admin-superadmin-secret-token-001}"
OPERATOR="${OPERATOR:-sk-admin-operator-secret-token-002}"
VIEWER="${VIEWER:-sk-admin-viewer-secret-token-003}"

req() {
  method="$1"
  path="$2"
  token="${3:-}"
  data="${4:-}"

  url="${API}${path}"

  if [ -n "${data}" ]; then
    if [ -n "${token}" ]; then
      curl -sS -i -X "${method}" "${url}" -H "Authorization: Bearer ${token}" -H "content-type: application/json" -d "${data}"
      return
    fi
    curl -sS -i -X "${method}" "${url}" -H "content-type: application/json" -d "${data}"
    return
  fi

  if [ -n "${token}" ]; then
    curl -sS -i -X "${method}" "${url}" -H "Authorization: Bearer ${token}"
    return
  fi

  curl -sS -i -X "${method}" "${url}"
}

echo "API=${API}"

echo "TEST1 no token /stats"
req GET "/api/admin/stats" | cat
echo ""

echo "TEST2 invalid token /stats"
req GET "/api/admin/stats" "invalid-token" | cat
echo ""

echo "TEST3 superadmin /stats"
req GET "/api/admin/stats" "${SUPER}" | cat
echo ""

echo "TEST4 viewer /workers (expect 403)"
req GET "/api/admin/workers" "${VIEWER}" | cat
echo ""

echo "TEST5 operator /workers (expect 200)"
req GET "/api/admin/workers" "${OPERATOR}" | cat
echo ""

echo "TEST6 operator /principals (expect 403)"
req GET "/api/admin/principals" "${OPERATOR}" | cat
echo ""

echo "TEST7 superadmin /principals (expect 200)"
req GET "/api/admin/principals" "${SUPER}" | cat
echo ""

echo "TEST8 create principal (expect 201)"
req POST "/api/admin/principals" "${SUPER}" '{"name":"testadmin","role":"ops"}' | cat
echo ""
