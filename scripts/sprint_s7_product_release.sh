set -u
set -o pipefail

ROOT="/Users/waheebmahmoud/dev/pro-work"
cd "$ROOT"

APP_PORT="${APP_PORT:-3010}"
BASE_URL="http://127.0.0.1:${APP_PORT}"

OUT="$ROOT/evidence/sprintS7/$(date -u +%Y%m%dT%H%M%SZ)"
mkdir -p "$OUT"
mkdir -p "$ROOT/evidence/sprintS7"

npm_ci_ok="unknown"
lint_ok="unknown"
typecheck_ok="unknown"
test_ok="unknown"
health_ok="unknown"
i18n_en_ok="unknown"
i18n_ar_ok="unknown"

echo "repo=$ROOT" | tee "$OUT/meta.txt"
echo "app_port=$APP_PORT" | tee -a "$OUT/meta.txt"
echo "base_url=$BASE_URL" | tee -a "$OUT/meta.txt"

git log -1 --oneline | tee "$OUT/git_head.txt" || true
git status --porcelain | tee "$OUT/git_status.txt" || true
git rev-parse --abbrev-ref HEAD | tee "$OUT/git_branch.txt" || true

echo "NOTE: App runtime expected under $ROOT/app" | tee "$OUT/runtime_note.txt"

APP_DIR="$ROOT/app"

if [ -f "$APP_DIR/package.json" ]; then
  cd "$APP_DIR"

  echo "== install (npm ci) ==" | tee "$OUT/install.txt"
  npm ci 2>&1 | tee -a "$OUT/install.txt"
  npm_ci_exit="${PIPESTATUS[0]:-1}"
  if [ "$npm_ci_exit" = "0" ]; then npm_ci_ok="true"; else npm_ci_ok="false"; fi
  echo "npm_ci_exit=$npm_ci_exit" | tee -a "$OUT/install.txt"

  echo "== lint ==" | tee "$OUT/lint.txt"
  npm run lint 2>&1 | tee -a "$OUT/lint.txt"
  lint_exit="${PIPESTATUS[0]:-1}"
  if [ "$lint_exit" = "0" ]; then lint_ok="true"; else lint_ok="false"; fi
  echo "lint_exit=$lint_exit" | tee -a "$OUT/lint.txt"

  echo "== typecheck ==" | tee "$OUT/typecheck.txt"
  npm run typecheck 2>&1 | tee -a "$OUT/typecheck.txt"
  typecheck_exit="${PIPESTATUS[0]:-1}"
  if [ "$typecheck_exit" = "0" ]; then typecheck_ok="true"; else typecheck_ok="false"; fi
  echo "typecheck_exit=$typecheck_exit" | tee -a "$OUT/typecheck.txt"

  echo "== test ==" | tee "$OUT/test.txt"
  npm test 2>&1 | tee -a "$OUT/test.txt"
  test_exit="${PIPESTATUS[0]:-1}"
  if [ "$test_exit" = "0" ]; then test_ok="true"; else test_ok="false"; fi
  echo "test_exit=$test_exit" | tee -a "$OUT/test.txt"

  cd "$ROOT"
else
  echo "SKIP: app/package.json not found. No npm checks executed." | tee "$OUT/npm_skipped.txt"
  npm_ci_ok="skipped"
  lint_ok="skipped"
  typecheck_ok="skipped"
  test_ok="skipped"
fi

echo "== health ==" | tee "$OUT/health.txt"
curl -sS "$BASE_URL/health" 2>&1 | tee -a "$OUT/health.txt"
health_exit="${PIPESTATUS[0]:-1}"
if [ "$health_exit" = "0" ]; then health_ok="true"; else health_ok="false"; fi
echo | tee -a "$OUT/health.txt"
echo "health_exit=$health_exit" | tee -a "$OUT/health.txt"

echo "== i18n ping (en) ==" | tee "$OUT/i18n_en.txt"
curl -sS "$BASE_URL/api/i18n/ping?lang=en" 2>&1 | tee -a "$OUT/i18n_en.txt"
i18n_en_exit="${PIPESTATUS[0]:-1}"
if [ "$i18n_en_exit" = "0" ]; then i18n_en_ok="true"; else i18n_en_ok="false"; fi
echo | tee -a "$OUT/i18n_en.txt"
echo "i18n_en_exit=$i18n_en_exit" | tee -a "$OUT/i18n_en.txt"

echo "== i18n ping (ar) ==" | tee "$OUT/i18n_ar.txt"
curl -sS "$BASE_URL/api/i18n/ping?lang=ar" 2>&1 | tee -a "$OUT/i18n_ar.txt"
i18n_ar_exit="${PIPESTATUS[0]:-1}"
if [ "$i18n_ar_exit" = "0" ]; then i18n_ar_ok="true"; else i18n_ar_ok="false"; fi
echo | tee -a "$OUT/i18n_ar.txt"
echo "i18n_ar_exit=$i18n_ar_exit" | tee -a "$OUT/i18n_ar.txt"

cat > "$OUT/S7_PRODUCT_RELEASE_SUMMARY.md" << EOF
Sprint S7 Product Release Evidence Summary

Timestamp (UTC): $(basename "$OUT")
Repo Path: $ROOT
App Path: $APP_DIR

Runtime:
APP_PORT=$APP_PORT
BASE_URL=$BASE_URL

Checks:
npm_ci_ok=$npm_ci_ok
lint_ok=$lint_ok
typecheck_ok=$typecheck_ok
test_ok=$test_ok
health_ok=$health_ok
i18n_en_ok=$i18n_en_ok
i18n_ar_ok=$i18n_ar_ok

Evidence folder: $OUT
EOF

echo "$OUT" > "$ROOT/evidence/sprintS7/LATEST.txt"
echo "OK: Evidence exported to $OUT"
