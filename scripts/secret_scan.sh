#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

TS="$(date -u +%Y%m%dT%H%M%SZ)"
OUT_DIR="${1:-$ROOT_DIR/evidence/sprintS8/$TS}"
mkdir -p "$OUT_DIR"

LOG="$OUT_DIR/secret_scan.log"

{
  echo "SECRET SCAN"
  echo "ts=$TS"
  echo "root=$ROOT_DIR"
  echo

  if ! command -v gitleaks >/dev/null 2>&1; then
    echo "gitleaks not found."
    echo "Install:"
    echo "  macOS (brew): brew install gitleaks"
    echo "  or download release binary from gitleaks repo"
    exit 2
  fi

  echo "gitleaks=$(gitleaks version || true)"
  echo
  echo "== gitleaks detect =="
  gitleaks detect --source . --config .gitleaks.toml --no-git --report-format json --report-path "$OUT_DIR/gitleaks_report.json"
  echo "OK: report=$OUT_DIR/gitleaks_report.json"
} | tee "$LOG"

echo "OK: wrote $LOG"
