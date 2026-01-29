#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

TS="$(date -u +%Y%m%dT%H%M%SZ)"
OUT_DIR="${1:-$ROOT_DIR/evidence/sprintS8/$TS}"
mkdir -p "$OUT_DIR"

LOG="$OUT_DIR/release_gate.log"

run_if_script() {
  local script="$1"
  local cmd="$2"
  local has
  has="$(node -e "const p=require('./package.json'); console.log(p.scripts && p.scripts['$script'] ? 'yes' : 'no')")"
  if [ "$has" = "yes" ]; then
    echo
    echo "== npm run $script =="
    eval "$cmd"
  else
    echo
    echo "== skip: no '$script' script =="
  fi
}

{
  echo "RELEASE GATE"
  echo "ts=$TS"
  echo "root=$ROOT_DIR"
  echo "branch=$(git rev-parse --abbrev-ref HEAD 2>/dev/null || true)"
  echo "commit=$(git rev-parse HEAD 2>/dev/null || true)"
  echo

  if [ ! -f "$ROOT_DIR/package.json" ]; then
    echo "No package.json found; nothing to gate."
    exit 0
  fi

  if ! command -v node >/dev/null 2>&1; then
    echo "node not found."
    exit 1
  fi
  if ! command -v npm >/dev/null 2>&1; then
    echo "npm not found."
    exit 1
  fi

  echo "node=$(node -v)"
  echo "npm=$(npm -v)"

  echo
  echo "== install =="
  if [ -f package-lock.json ]; then
    npm ci
  else
    npm install
  fi

  run_if_script "lint" "npm run lint"
  if node -e "const p=require('./package.json'); process.exit(p.scripts && p.scripts.typecheck ? 0 : 1)"; then
    run_if_script "typecheck" "npm run typecheck"
  else
    if node -e "const p=require('./package.json'); process.exit(p.scripts && p.scripts['check:types'] ? 0 : 1)"; then
      echo
      echo "== npm run check:types =="
      npm run check:types
    else
      echo
      echo "== skip: no typecheck/check:types script =="
    fi
  fi
  run_if_script "test" "npm test"

  echo
  echo "== security audit =="
  set +e
  npm audit --audit-level=high
  AUDIT_CODE=$?
  set -e
  echo "npm_audit_exit_code=$AUDIT_CODE"
} | tee "$LOG"

echo "OK: wrote $LOG"
