set -euo pipefail

ROOT="/Users/waheebmahmoud/dev/pro-work"
cd "${ROOT}"

COMMIT="${1:-}"
if [ -z "${COMMIT}" ]; then
  echo "usage: bash scripts/restore_app_from_commit.sh <commit_sha>"
  exit 2
fi

TS="$(date -u +"%Y%m%dT%H%M%SZ")"
BACKUP_DIR="evidence/restore-backups/${TS}"
mkdir -p "${BACKUP_DIR}"

restore_one() {
  local rel="$1"
  local src="${COMMIT}:${rel}"

  if git cat-file -e "${src}" 2>/dev/null; then
    if [ -f "${rel}" ]; then
      mkdir -p "$(dirname "${BACKUP_DIR}/${rel}")"
      cp -f "${rel}" "${BACKUP_DIR}/${rel}"
      echo "backup: ${rel} -> ${BACKUP_DIR}/${rel}"
    fi

    mkdir -p "$(dirname "${rel}")"
    git show "${src}" > "${rel}"
    echo "restored: ${rel} from ${src}"
  else
    echo "skip: ${rel} not found in ${COMMIT}"
  fi
}

restore_one "app/package.json"
restore_one "app/server.js"
restore_one "app/server.test.js"
restore_one "app/scripts/ports_kill.sh"

echo ""
echo "backup_dir=${BACKUP_DIR}"
