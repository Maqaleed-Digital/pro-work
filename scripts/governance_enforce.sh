set -euo pipefail

ROOT="$(pwd)"
SCOPE_FILE="${ROOT}/governance/enforcement.scope.json"

if [ ! -f "$SCOPE_FILE" ]; then
  echo "governance_enforcement_ok=false"
  echo "error=missing_scope_file"
  exit 1
fi

MODE="$(node -p "require('${SCOPE_FILE}').mode")"

if [ "$MODE" != "freeze" ]; then
  echo "governance_enforcement_ok=true"
  echo "mode=${MODE}"
  exit 0
fi

CHANGED_FILES="$(git diff --name-only HEAD || true)"

if [ -z "$CHANGED_FILES" ]; then
  echo "governance_enforcement_ok=true"
  echo "changed_files=0"
  exit 0
fi

node - <<'NODE'
const fs = require("fs")

const scope = JSON.parse(fs.readFileSync("governance/enforcement.scope.json", "utf8"))
const frozen = scope.frozen_paths || []
const overrideFiles = scope.override?.required_files_any || []
const requiredFields = scope.override?.required_fields || []

const changed = fs.readFileSync(0, "utf8")
  .split("\n")
  .map(s => s.trim())
  .filter(Boolean)

const violations = changed.filter(f =>
  frozen.some(p => f === p || f.startsWith(p + "/"))
)

const overrideFile = overrideFiles.find(p => fs.existsSync(p))

function validOverride() {
  if (!overrideFile) return false
  const data = JSON.parse(fs.readFileSync(overrideFile, "utf8"))
  return requiredFields.every(k => data[k])
}

if (violations.length === 0) {
  console.log("governance_enforcement_ok=true")
  process.exit(0)
}

if (validOverride()) {
  console.log("governance_enforcement_ok=true")
  console.log("override_used=true")
  process.exit(0)
}

console.log("governance_enforcement_ok=false")
console.log("violations=" + violations.join(","))
process.exit(2)
NODE <<EOF
${CHANGED_FILES}
EOF
