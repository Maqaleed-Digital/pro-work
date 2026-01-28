set -euo pipefail

ROOT="/Users/waheebmahmoud/dev/pro-work"
APP_ROOT="$ROOT/app"

TS="$(date -u +"%Y%m%dT%H%M%SZ")"
EVID_ROOT="$ROOT/evidence/sprintS5/$TS"
mkdir -p "$EVID_ROOT"

echo "ROOT=$ROOT" | tee "$EVID_ROOT/run.env"
echo "APP_ROOT=$APP_ROOT" | tee -a "$EVID_ROOT/run.env"
echo "EVID_ROOT=$EVID_ROOT" | tee -a "$EVID_ROOT/run.env"

echo "STEP=repo_info" | tee "$EVID_ROOT/step_repo_info.txt"
cd "$ROOT"
git log -1 --oneline > "$EVID_ROOT/git_head.txt" 2>&1 || true

echo "STEP=scan_s5_docs" | tee "$EVID_ROOT/step_scan_s5_docs.txt"
rg -n --hidden --glob '!.git/**' --glob '!**/node_modules/**' \
  'Sprint\s*S5|\bS5\b|execution guide|Execution Guide|Sprint-5|Sprint 5' . \
  > "$EVID_ROOT/s5_doc_hits.txt" 2>&1 || true

echo "STEP=app_tooling_versions" | tee "$EVID_ROOT/step_versions.txt"
cd "$APP_ROOT"
node -v > "$EVID_ROOT/node_version.txt" 2>&1 || true

PKG_MGR="npm"
PM_INSTALL="npm install"
PM_RUN="npm run -s"

if [ -f "$APP_ROOT/pnpm-lock.yaml" ]; then
  PKG_MGR="pnpm"
  PM_INSTALL="pnpm install"
  PM_RUN="pnpm -s run"
fi

echo "PKG_MGR=$PKG_MGR" > "$EVID_ROOT/pkg.env"

if command -v pnpm >/dev/null 2>&1; then
  pnpm -v > "$EVID_ROOT/pnpm_version.txt" 2>&1 || true
fi

npm -v > "$EVID_ROOT/npm_version.txt" 2>&1 || true

echo "STEP=install" | tee "$EVID_ROOT/step_install.txt"
INSTALL_OK="false"
if $PM_INSTALL > "$EVID_ROOT/${PKG_MGR}_install.txt" 2>&1; then
  INSTALL_OK="true"
fi
echo "install_ok=$INSTALL_OK" > "$EVID_ROOT/checks.env"

echo "STEP=lint_typecheck_test" | tee "$EVID_ROOT/step_checks.txt"
LINT_OK="false"
TYPECHECK_OK="false"
TEST_OK="false"

if $PM_RUN lint > "$EVID_ROOT/${PKG_MGR}_lint.txt" 2>&1; then LINT_OK="true"; fi
if $PM_RUN typecheck > "$EVID_ROOT/${PKG_MGR}_typecheck.txt" 2>&1; then TYPECHECK_OK="true"; fi
if $PM_RUN test > "$EVID_ROOT/${PKG_MGR}_test.txt" 2>&1; then TEST_OK="true"; fi

echo "lint_ok=$LINT_OK" >> "$EVID_ROOT/checks.env"
echo "typecheck_ok=$TYPECHECK_OK" >> "$EVID_ROOT/checks.env"
echo "test_ok=$TEST_OK" >> "$EVID_ROOT/checks.env"

probe_health() {
  local port="$1"
  local u1="http://127.0.0.1:${port}/api/health"
  local u2="http://127.0.0.1:${port}/health"
  local out
  out="$(curl -sS --max-time 1 "$u1" 2>/dev/null || true)"
  if echo "$out" | grep -q '"ok"[[:space:]]*:[[:space:]]*true' && echo "$out" | grep -q '"service"[[:space:]]*:[[:space:]]*"pro-work"'; then
    echo "$port"
    return 0
  fi
  out="$(curl -sS --max-time 1 "$u2" 2>/dev/null || true)"
  if echo "$out" | grep -q '"ok"[[:space:]]*:[[:space:]]*true' && echo "$out" | grep -q '"service"[[:space:]]*:[[:space:]]*"pro-work"'; then
    echo "$port"
    return 0
  fi
  return 1
}

discover_port() {
  if [ -n "${APP_PORT:-}" ]; then
    if p="$(probe_health "$APP_PORT")"; then
      echo "$p"
      return 0
    fi
  fi

  for p in 3010 3011 3012 3013 3014 3015 3020 3021 3022 3030 3031 3032 8080; do
    if p2="$(probe_health "$p")"; then
      echo "$p2"
      return 0
    fi
  done

  for p in $(seq 8000 8090); do
    if p2="$(probe_health "$p")"; then
      echo "$p2"
      return 0
    fi
  done

  echo ""
  return 0
}

echo "STEP=health_probe" | tee "$EVID_ROOT/step_health.txt"
PORT_FOUND="$(discover_port)"
echo "APP_PORT=${APP_PORT:-}" > "$EVID_ROOT/runtime.env"
echo "PORT_FOUND=$PORT_FOUND" >> "$EVID_ROOT/runtime.env"

if [ -n "$PORT_FOUND" ]; then
  BASE_URL="http://127.0.0.1:${PORT_FOUND}"
  echo "BASE_URL=$BASE_URL" >> "$EVID_ROOT/runtime.env"
  curl -sS "$BASE_URL/api/health" > "$EVID_ROOT/health.json" 2>&1 || true
  curl -sS "$BASE_URL/health" > "$EVID_ROOT/health_legacy.json" 2>&1 || true
else
  echo "{\"ok\":false,\"error\":\"pro-work service not detected on expected ports\"}" > "$EVID_ROOT/health.json"
  echo "{\"ok\":false,\"error\":\"pro-work service not detected on expected ports\"}" > "$EVID_ROOT/health_legacy.json"
fi

echo "STEP=marketplace_loop_probe" | tee "$EVID_ROOT/step_loop.txt"
LOOP_DIR="$EVID_ROOT/loop"
mkdir -p "$LOOP_DIR"

if [ -n "$PORT_FOUND" ]; then
  BASE_URL="http://127.0.0.1:${PORT_FOUND}"

  curl -sS -X POST "$BASE_URL/api/loop/job" \
    -H "Content-Type: application/json" \
    -d "{\"title\":\"Test Job\",\"budget\":100,\"currency\":\"USD\"}" \
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
else
  echo "{\"ok\":false,\"error\":\"pro-work not detected; start server then rerun\"}" > "$LOOP_DIR/01_job.json"
  echo "{\"ok\":false,\"error\":\"pro-work not detected; start server then rerun\"}" > "$LOOP_DIR/02_apply.json"
  echo "{\"ok\":false,\"error\":\"pro-work not detected; start server then rerun\"}" > "$LOOP_DIR/03_accept.json"
  echo "{\"ok\":false,\"error\":\"pro-work not detected; start server then rerun\"}" > "$LOOP_DIR/04_complete.json"
  echo "{\"ok\":false,\"error\":\"pro-work not detected; start server then rerun\"}" > "$LOOP_DIR/05_payout.json"
  echo "JOB_ID=" > "$LOOP_DIR/ids.env"
fi

echo "STEP=write_summary" | tee "$EVID_ROOT/step_summary.txt"
SUMMARY="$EVID_ROOT/S5_NEXT3_MOVES_SUMMARY.md"

echo "ProWork — Sprint S5 Next 3 Moves Evidence Summary" > "$SUMMARY"
echo "" >> "$SUMMARY"
echo "Timestamp (UTC): $TS" >> "$SUMMARY"
echo "Repo Path: $ROOT" >> "$SUMMARY"
echo "App Path: $APP_ROOT" >> "$SUMMARY"
echo "" >> "$SUMMARY"

echo "S5 doc hits (excluding node_modules):" >> "$SUMMARY"
echo "" >> "$SUMMARY"
cat "$EVID_ROOT/s5_doc_hits.txt" >> "$SUMMARY" || true
echo "" >> "$SUMMARY"

echo "Package manager:" >> "$SUMMARY"
echo "" >> "$SUMMARY"
cat "$EVID_ROOT/pkg.env" >> "$SUMMARY" || true
echo "" >> "$SUMMARY"

echo "Checks:" >> "$SUMMARY"
echo "" >> "$SUMMARY"
cat "$EVID_ROOT/checks.env" >> "$SUMMARY" || true
echo "" >> "$SUMMARY"

echo "Runtime:" >> "$SUMMARY"
echo "" >> "$SUMMARY"
cat "$EVID_ROOT/runtime.env" >> "$SUMMARY" || true
echo "" >> "$SUMMARY"

echo "Health output (/api/health):" >> "$SUMMARY"
echo "" >> "$SUMMARY"
cat "$EVID_ROOT/health.json" >> "$SUMMARY" || true
echo "" >> "$SUMMARY"

echo "Health output (/health):" >> "$SUMMARY"
echo "" >> "$SUMMARY"
cat "$EVID_ROOT/health_legacy.json" >> "$SUMMARY" || true
echo "" >> "$SUMMARY"

echo "Loop outputs:" >> "$SUMMARY"
echo "" >> "$SUMMARY"
ls -la "$LOOP_DIR" >> "$SUMMARY" || true
echo "" >> "$SUMMARY"
echo "Evidence folder: $EVID_ROOT" >> "$SUMMARY"

echo "DONE: $EVID_ROOT"
