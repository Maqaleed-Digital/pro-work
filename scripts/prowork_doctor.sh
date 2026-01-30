set -euo pipefail

ROOT="/Users/waheebmahmoud/dev/pro-work"
REQ="${ROOT}/config/required_paths.txt"
POL="${ROOT}/config/path_policies.txt"

cd "${ROOT}"

echo "=== ProWork Doctor ==="
echo "root=${ROOT}"
echo "branch=$(git branch --show-current)"
echo "commit=$(git log -1 --oneline)"
echo ""

if [ ! -f "${REQ}" ]; then
  echo "ERROR: missing required paths manifest: ${REQ}"
  exit 2
fi

if [ ! -f "${POL}" ]; then
  echo "ERROR: missing path policies file: ${POL}"
  exit 2
fi

fail=0

is_tracked() {
  local rel="$1"
  local out
  out="$(git ls-files "${rel}" 2>/dev/null || true)"
  if [ -n "${out}" ]; then
    return 0
  fi
  return 1
}

policy_for() {
  local rel="$1"
  awk -v p="${rel}" '$2==p {print $1}' "${POL}" | head -n 1
}

check_exists() {
  local rel="$1"
  if [ -e "${rel}" ]; then
    return 0
  fi
  return 1
}

echo "=== Required Paths Check ==="
while IFS= read -r rel; do
  if [ -z "${rel}" ]; then
    continue
  fi

  pol="$(policy_for "${rel}")"
  if [ -z "${pol}" ]; then
    pol="TRACKED"
  fi

  echo "--- ${rel} (policy=${pol}) ---"

  if check_exists "${rel}"; then
    echo "exists=yes"
  else
    echo "exists=no"
    fail=1
  fi

  if [ "${pol}" = "TRACKED" ]; then
    if is_tracked "${rel}"; then
      echo "tracked=yes"
    else
      echo "tracked=no"
      fail=1
    fi
  fi

  if [ "${pol}" = "UNTRACKED" ]; then
    if is_tracked "${rel}"; then
      echo "tracked=yes (should be NO)"
      fail=1
    else
      echo "tracked=no (ok)"
    fi
  fi

  st="$(git status --porcelain=v1 "${rel}" 2>/dev/null || true)"
  if [ -n "${st}" ]; then
    echo "status=${st}"
  else
    echo "status=clean"
  fi

  echo ""
done < "${REQ}"

echo "=== Policy Check (UNTRACKED list) ==="
awk '$1=="UNTRACKED" {print $2}' "${POL}" | while IFS= read -r rel; do
  if [ -z "${rel}" ]; then
    continue
  fi
  if is_tracked "${rel}"; then
    echo "FAIL: ${rel} is tracked but policy says UNTRACKED"
    fail=1
  else
    echo "OK: ${rel} is not tracked"
  fi
done

echo ""
if [ "${fail}" -ne 0 ]; then
  echo "=== RESULT: FAIL ==="
  echo "Fix required paths/policies before continuing."
  exit 1
fi

echo "=== RESULT: PASS ==="
