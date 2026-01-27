set -euo pipefail

ROOT="/Users/waheebmahmoud/dev/pro-work"
cd "$ROOT"

TS="$(date -u +"%Y%m%dT%H%M%SZ")"
EVID_ROOT="$ROOT/evidence/sprintS5/$TS"
mkdir -p "$EVID_ROOT"

echo "ROOT=$ROOT" | tee "$EVID_ROOT/run.env"
echo "EVID_ROOT=$EVID_ROOT" | tee -a "$EVID_ROOT/run.env"

echo "STEP=repo_info" | tee "$EVID_ROOT/step_repo_info.txt"
git log -1 --oneline > "$EVID_ROOT/git_head.txt" 2>&1 || true
node -v > "$EVID_ROOT/node_version.txt" 2>&1 || true
npm -v > "$EVID_ROOT/npm_version.txt" 2>&1 || true

echo "STEP=scan_s5_docs" | tee "$EVID_ROOT/step_scan_s5_docs.txt"
rg -n --hidden --glob '!.git/**' --glob '!**/node_modules/**' \
  'Sprint\s*S5|\bS5\b|execution guide|Execution Guide|Sprint-5|Sprint 5' . \
  > "$EVID_ROOT/s5_doc_hits.txt" 2>&1 || true

echo "STEP=install" | tee "$EVID_ROOT/step_install.txt"
INSTALL_OK="false"
if [ -f "$ROOT/package-lock.json" ]; then
  if npm ci > "$EVID_ROOT/npm_ci.txt" 2>&1; then INSTALL_OK="true"; fi
else
  if npm install > "$EVID_ROOT/npm_install.txt" 2>&1; then INSTALL_OK="true"; fi
fi
echo "install_ok=$INSTALL_OK" > "$EVID_ROOT/checks.env"

echo "STEP=lint_typecheck_test" | tee "$EVID_ROOT/step_checks.txt"
LINT_OK="false"
TYPECHECK_OK="false"
TEST_OK="false"

if npm run -s lint > "$EVID_ROOT/npm_lint.txt" 2>&1; then LINT_OK="true"; fi
if npm run -s typecheck > "$EVID_ROOT/npm_typecheck.txt" 2>&1; then TYPECHECK_OK="true"; fi
if npm run -s test > "$EVID_ROOT/npm_test.txt" 2>&1; then TEST_OK="true"; fi

echo "lint_ok=$LINT_OK" >> "$EVID_ROOT/checks.env"
echo "typecheck_ok=$TYPECHECK_OK" >> "$EVID_ROOT/checks.env"
echo "test_ok=$TEST_OK" >> "$EVID_ROOT/checks.env"

echo "STEP=health_probe" | tee "$EVID_ROOT/step_health.txt"
APP_PORT="${APP_PORT:-8010}"
BASE_URL="http://127.0.0.1:${APP_PORT}"
echo "APP_PORT=$APP_PORT" > "$EVID_ROOT/runtime.env"
echo "BASE_URL=$BASE_URL" >> "$EVID_ROOT/runtime.env"
curl -sS "$BASE_URL/api/health" > "$EVID_ROOT/health.json" 2>&1 || true

echo "STEP=marketplace_loop_probe" | tee "$EVID_ROOT/step_loop.txt"
LOOP_DIR="$EVID_ROOT/loop"
mkdir -p "$LOOP_DIR"

curl -sS -X POST "$BASE_URL/api/loop/job" \
  -H "Content-Type: application/json" \
  -d "{\"title\":\"Test Job\",\"budget\":100}" \
  > "$LOOP_DIR/01_job.json" 2>&1 || true

JOB_ID="$(cat "$LOOP_DIR/01_job.json" 2>/dev/null | node -e 'let s="";process.stdin.on("data",d=>s+=d);process.stdin.on("end",()=>{try{let j=JSON.parse(s);console.log(j.job_id||j.id||"")}catch(e){console.log("")}})' || true)"
echo "JOB_ID=$JOB_ID" > "$LOOP_DIR/ids.env"

curl -sS -X POST "$BASE_URL/api/loop/apply" \
  -H "Content-Type: application/json" \
  -d "{\"job_id\":\"$JOB_ID\",\"seller_id\":\"seller_demo\",\"price\":100}" \
  > "$LOOP_DIR/02_apply.json" 2>&1 || true

APP_ID="$(cat "$LOOP_DIR/02_apply.json" 2>/dev/null | node -e 'let s="";process.stdin.on("data",d=>s+=d);process.stdin.on("end",()=>{try{let j=JSON.parse(s);console.log(j.application_id||j.id||"")}catch(e){console.log("")}})' || true)"
echo "APP_ID=$APP_ID" >> "$LOOP_DIR/ids.env"

curl -sS -X POST "$BASE_URL/api/loop/accept" \
  -H "Content-Type: application/json" \
  -d "{\"job_id\":\"$JOB_ID\",\"application_id\":\"$APP_ID\"}" \
  > "$LOOP_DIR/03_accept.json" 2>&1 || true

curl -sS -X POST "$BASE_URL/api/loop/complete" \
  -H "Content-Type: application/json" \
  -d "{\"job_id\":\"$JOB_ID\"}" \
  > "$LOOP_DIR/04_complete.json" 2>&1 || true

curl -sS -X POST "$BASE_URL/api/loop/payout" \
  -H "Content-Type: application/json" \
  -d "{\"job_id\":\"$JOB_ID\",\"amount\":100,\"currency\":\"USD\"}" \
  > "$LOOP_DIR/05_payout.json" 2>&1 || true

echo "STEP=write_summary" | tee "$EVID_ROOT/step_summary.txt"
SUMMARY="$EVID_ROOT/S5_NEXT3_MOVES_SUMMARY.md"

echo "ProWork — Sprint S5 Next 3 Moves Evidence Summary" > "$SUMMARY"
echo "" >> "$SUMMARY"
echo "Timestamp (UTC): $TS" >> "$SUMMARY"
echo "Repo Path: $ROOT" >> "$SUMMARY"
echo "" >> "$SUMMARY"

echo "S5 doc hits (excluding node_modules):" >> "$SUMMARY"
echo "" >> "$SUMMARY"
cat "$EVID_ROOT/s5_doc_hits.txt" >> "$SUMMARY" || true
echo "" >> "$SUMMARY"

echo "Checks:" >> "$SUMMARY"
echo "" >> "$SUMMARY"
cat "$EVID_ROOT/checks.env" >> "$SUMMARY" || true
echo "" >> "$SUMMARY"

echo "Health output:" >> "$SUMMARY"
echo "" >> "$SUMMARY"
cat "$EVID_ROOT/health.json" >> "$SUMMARY" || true
echo "" >> "$SUMMARY"

echo "Loop outputs:" >> "$SUMMARY"
echo "" >> "$SUMMARY"
ls -la "$LOOP_DIR" >> "$SUMMARY" || true
echo "" >> "$SUMMARY"
echo "Evidence folder: $EVID_ROOT" >> "$SUMMARY"

echo "DONE: $EVID_ROOT"
