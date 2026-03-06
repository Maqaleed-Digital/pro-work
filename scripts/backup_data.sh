#!/usr/bin/env bash
# S35: ProWork data backup
# Usage:
#   ./scripts/backup_data.sh [output-dir]
#   PROWORK_DATA_DIR=/var/data/prowork ./scripts/backup_data.sh
#   BACKUP_DEST=/mnt/backups ./scripts/backup_data.sh
#
# Outputs into $BACKUP_DEST (or exports/backups/):
#   prowork-data-<timestamp>.tar.gz
#   prowork-data-<timestamp>.sha256
#   prowork-data-<timestamp>.manifest.json
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(dirname "$SCRIPT_DIR")"

# Source: PROWORK_DATA_DIR in production; app/data in dev
SRC_DIR="${PROWORK_DATA_DIR:-$REPO_ROOT/app/data}"
OUT_DIR="${BACKUP_DEST:-${1:-$REPO_ROOT/exports/backups}}"

mkdir -p "$OUT_DIR"

TS="$(date -u +%Y%m%dT%H%M%SZ)"
HNAME="${HOSTNAME:-$(hostname -s 2>/dev/null || echo unknown)}"
ARCHIVE="prowork-data-${TS}.tar.gz"

echo "[backup] source:  $SRC_DIR"
echo "[backup] dest:    $OUT_DIR/$ARCHIVE"

tar -czf "$OUT_DIR/$ARCHIVE" -C "$(dirname "$SRC_DIR")" "$(basename "$SRC_DIR")"

# sha256 — cross-platform (Linux: sha256sum, macOS: shasum)
if command -v sha256sum >/dev/null 2>&1; then
  SHA256="$(sha256sum "$OUT_DIR/$ARCHIVE" | awk '{print $1}')"
elif command -v shasum >/dev/null 2>&1; then
  SHA256="$(shasum -a 256 "$OUT_DIR/$ARCHIVE" | awk '{print $1}')"
else
  SHA256="unavailable"
fi

echo "$SHA256  $ARCHIVE" > "$OUT_DIR/${ARCHIVE%.tar.gz}.sha256"

cat > "$OUT_DIR/${ARCHIVE%.tar.gz}.manifest.json" <<MANIFEST
{
  "timestamp": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "hostname": "${HNAME}",
  "source_dir": "${SRC_DIR}",
  "archive": "${ARCHIVE}",
  "sha256": "${SHA256}"
}
MANIFEST

echo "[backup] archive:  $OUT_DIR/$ARCHIVE"
echo "[backup] sha256:   $SHA256"
echo "[backup] manifest: $OUT_DIR/${ARCHIVE%.tar.gz}.manifest.json"
