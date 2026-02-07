set -euo pipefail

ROOT="$(pwd)"
TS="$(date -u +%Y%m%dT%H%M%SZ)"
OUT="$ROOT/evidence/sprintS23/$TS"

mkdir -p "$OUT"

{
  echo "timestamp_utc=$TS"
  echo "root=$ROOT"
  echo ""
  echo "=== git: status ==="
  git status --short
  echo ""
  echo "=== git: branch ==="
  git branch --show-current
  echo ""
  echo "=== git: last commit ==="
  git log -1 --oneline
  echo ""
  echo "=== node: version ==="
  node -v
  echo ""
  echo "=== npm: version ==="
  npm -v
} | tee "$OUT/00_context.txt"

if [ -d "$ROOT/app" ]; then
  (
    cd "$ROOT/app"
    {
      echo "=== app: path ==="
      pwd
      echo ""
      echo "=== npm ci ==="
      npm ci
      echo ""
      echo "=== lint ==="
      npm run lint
      echo ""
      echo "=== typecheck ==="
      npm run typecheck
      echo ""
      echo "=== test ==="
      npm test
      echo ""
      echo "=== health ==="
      curl -sS "http://127.0.0.1:3010/health" || true
      echo ""
      echo "=== admin: governance (if exposed) ==="
      curl -sS "http://127.0.0.1:3010/admin/governance" || true
      echo ""
      echo "=== admin: stats (if exposed) ==="
      curl -sS "http://127.0.0.1:3010/admin/stats" || true
    } | tee "$OUT/10_app_checks.txt"
  )
else
  echo "app_dir_missing=true" | tee "$OUT/10_app_checks.txt"
fi

echo "evidence_out=$OUT" | tee "$OUT/99_done.txt"
