#!/usr/bin/env bash
set -euo pipefail

OUT_DIR="baseline"
mkdir -p "$OUT_DIR"

COMMIT="$(git rev-parse HEAD)"
SHORT="$(git rev-parse --short HEAD)"

LATEST_ZIP="$(ls -t evidence_output/*/*.zip | head -n1)"
LATEST_SHA="$(cat "${LATEST_ZIP}.sha256" | awk '{print $1}')"

TS="$(date -u +"%Y%m%dT%H%M%SZ")"

BASE_FILE="$OUT_DIR/PROWORK_BASELINE_${TS}.json"

cat <<EOF > "$BASE_FILE"
{
  "commit_full": "$COMMIT",
  "commit_short": "$SHORT",
  "evidence_zip": "$LATEST_ZIP",
  "evidence_sha256": "$LATEST_SHA",
  "generated_at": "$TS"
}
EOF

echo "BASELINE_FILE=$BASE_FILE"
echo "COMMIT=$COMMIT"
echo "EVIDENCE_SHA=$LATEST_SHA"
