set -euo pipefail

ROOT="/Users/waheebmahmoud/dev/pro-work"
cd "${ROOT}"

echo "=== ProWork Doctor ==="
echo "root=${ROOT}"
echo "branch=$(git branch --show-current)"
echo "commit=$(git log -1 --oneline)"
echo ""

check_file() {
  local rel="$1"
  echo "--- ${rel} ---"
  if [ -f "${rel}" ]; then
    echo "exists=yes"
    ls -la "${rel}" || true
  else
    echo "exists=no"
  fi

  local tracked
  tracked="$(git ls-files "${rel}" || true)"
  if [ -n "${tracked}" ]; then
    echo "tracked=yes"
  else
    echo "tracked=no"
  fi

  local st
  st="$(git status --porcelain=v1 "${rel}" || true)"
  if [ -n "${st}" ]; then
    echo "status=${st}"
  else
    echo "status=clean"
  fi

  echo ""
}

check_file "app/package.json"
check_file "app/server.js"

echo "=== app/ untracked scan (top 50) ==="
git status --porcelain=v1 "app" | head -n 50 || true
echo ""

echo "=== package.json find ==="
find "." -maxdepth 4 -name "package.json" -print 2>/dev/null || true
echo ""

echo "=== done ==="
