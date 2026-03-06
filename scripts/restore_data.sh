#!/usr/bin/env bash
# S35: ProWork data restore
# Usage:
#   ./scripts/restore_data.sh <archive.tar.gz> [target-dir]
#   RESTORE_FORCE=1 ./scripts/restore_data.sh <archive.tar.gz> [target-dir]
#
# Refuses to overwrite a non-empty target unless RESTORE_FORCE=1.
# Default target: $PROWORK_DATA_DIR (prod) or app/data (dev).
set -euo pipefail

ARCHIVE="${1:-}"
if [ -z "$ARCHIVE" ]; then
  echo "Usage: $0 <archive.tar.gz> [target-dir]" >&2
  exit 1
fi
if [ ! -f "$ARCHIVE" ]; then
  echo "Error: archive not found: $ARCHIVE" >&2
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(dirname "$SCRIPT_DIR")"

TARGET="${2:-${PROWORK_DATA_DIR:-$REPO_ROOT/app/data}}"

echo "[restore] archive: $ARCHIVE"
echo "[restore] target:  $TARGET"

# Refuse to overwrite unless RESTORE_FORCE=1
if [ -d "$TARGET" ] && [ "$(ls -A "$TARGET" 2>/dev/null)" ] && [ "${RESTORE_FORCE:-0}" != "1" ]; then
  echo "Error: target directory exists and is non-empty: $TARGET" >&2
  echo "       Set RESTORE_FORCE=1 to overwrite." >&2
  exit 1
fi

mkdir -p "$TARGET"
tar -xzf "$ARCHIVE" -C "$TARGET" --strip-components=1

echo "[restore] done: $TARGET"
