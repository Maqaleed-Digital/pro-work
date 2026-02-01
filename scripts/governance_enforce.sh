set -euo pipefail

ROOT="$(pwd)"
SCOPE_FILE="${ROOT}/governance/enforcement.scope.json"

if [ ! -f "$SCOPE_FILE" ]; then
  echo "governance_enforcement_ok=false"
  echo "error=missing_scope_file"
  echo "path=${SCOPE_FILE}"
  exit 1
fi

MODE="$(node -p "require('${SCOPE_FILE}').mode")"

if [ "$MODE" != "freeze" ]; then
  echo "governance_enforcement_ok=true"
  echo "mode=${MODE}"
  exit 0
fi

TMP_CHANGED="$(mktemp)"
trap 'rm -f "$TMP_CHANGED"' EXIT

git diff --name-only --diff-filter=ACMRTUXB HEAD > "$TMP_CHANGED" || true

if [ ! -s "$TMP_CHANGED" ]; then
  echo "governance_enforcement_ok=true"
  echo "changed_files=0"
  exit 0
fi

export GOV_SCOPE_FILE="$SCOPE_FILE"
export GOV_CHANGED_FILE="$TMP_CHANGED"

node -e "
const fs = require('fs')

const scopePath = process.env.GOV_SCOPE_FILE
const changedPath = process.env.GOV_CHANGED_FILE

const scope = JSON.parse(fs.readFileSync(scopePath, 'utf8'))
const frozen = Array.isArray(scope.frozen_paths) ? scope.frozen_paths : []

const overrideEnabled = !!(scope.override && scope.override.enabled)
const overrideFiles = (scope.override && Array.isArray(scope.override.required_files_any)) ? scope.override.required_files_any : []
const requiredFields = (scope.override && Array.isArray(scope.override.required_fields)) ? scope.override.required_fields : []

const changed = fs.readFileSync(changedPath, 'utf8')
  .split('\n')
  .map(s => s.trim())
  .filter(Boolean)

const isFrozen = (f) => frozen.some(p => f === p || f.startsWith(p + '/'))
const violations = changed.filter(isFrozen)

function validateOverride() {
  if (!overrideEnabled) return { ok: false, reason: 'override_disabled' }
  const file = overrideFiles.find(p => fs.existsSync(p))
  if (!file) return { ok: false, reason: 'override_missing' }
  let obj = null
  try {
    obj = JSON.parse(fs.readFileSync(file, 'utf8'))
  } catch {
    return { ok: false, reason: 'override_invalid_json', file }
  }
  const missing = requiredFields.filter(k => obj[k] === undefined || obj[k] === null || String(obj[k]).trim() === '')
  if (missing.length) return { ok: false, reason: 'override_missing_fields', file, missing }
  return { ok: true, file }
}

if (violations.length === 0) {
  console.log('governance_enforcement_ok=true')
  console.log('violations=0')
  process.exit(0)
}

const ov = validateOverride()
if (ov.ok) {
  console.log('governance_enforcement_ok=true')
  console.log('violations=' + violations.length)
  console.log('override_used=true')
  console.log('override_file=' + ov.file)
  console.log('frozen_changes_allowed=true')
  process.exit(0)
}

console.log('governance_enforcement_ok=false')
console.log('violations=' + violations.length)
console.log('override_used=false')
console.log('violating_files=' + violations.join(','))
process.exit(2)
"
