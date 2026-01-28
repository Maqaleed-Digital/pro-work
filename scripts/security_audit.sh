#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

TS="$(date -u +%Y%m%dT%H%M%SZ)"
OUT_DIR="${1:-$ROOT_DIR/evidence/sprintS8/$TS}"
mkdir -p "$OUT_DIR"

LOG="$OUT_DIR/security_audit.log"

{
  echo "SECURITY AUDIT"
  echo "ts=$TS"
  echo "root=$ROOT_DIR"
  echo

  if [ ! -f "$ROOT_DIR/package.json" ]; then
    echo "No package.json found; skipping npm audit."
    exit 0
  fi

  if command -v npm >/dev/null 2>&1; then
    echo "npm=$(npm -v)"
  else
    echo "npm not found."
    exit 1
  fi

  echo
  echo "== npm audit (non-fatal output capture) =="
  set +e
  npm audit --audit-level=high
  CODE=$?
  set -e
  echo
  echo "npm_audit_exit_code=$CODE"
  echo "NOTE: Non-zero exit code indicates vulnerabilities above threshold."
} | tee "$LOG"

echo "OK: wrote $LOG"
