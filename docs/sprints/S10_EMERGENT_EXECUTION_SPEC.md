# S10 Emergent Application Genesis — Execution Spec

## Objective
Generate the initial Emergent Application Genesis scaffold in a controlled, auditable way that outputs:
- A minimal app baseline that runs reliably
- A first-pass module registry and route map signals
- A traceable evidence pack for validation

## Execution Context
- Repo root: /Users/waheebmahmoud/dev/pro-work
- App root: /Users/waheebmahmoud/dev/pro-work/app
- Evidence root: evidence/sprintS10/<UTC_TS>
- Exports root: exports/sprint-s10/<UTC_TS>
- Runtime: APP_PORT=3010, BASE_URL=http://127.0.0.1:3010

## Hard Gates
### G1 Build Integrity
- install_ok
- lint_ok
- typecheck_ok
- test_ok

### G2 Runtime Integrity
- devserver_running
- health_ok (/api/health)
- base_route_ok (/ headers captured)

### G3 Genesis Artifacts Integrity
- exports created under exports/sprint-s10/<UTC_TS>
- indexes captured for traceability

## Commands to Run (Authoritative)
All commands must be executed from the specified paths.

### 1) Create evidence roots (repo root)
cd "/Users/waheebmahmoud/dev/pro-work"

export S10_TS="$(date -u +%Y%m%dT%H%M%SZ)"
export S10_EVID_ROOT="/Users/waheebmahmoud/dev/pro-work/evidence/sprintS10/${S10_TS}"
export S10_EXPORT_ROOT="/Users/waheebmahmoud/dev/pro-work/exports/sprint-s10/${S10_TS}"

mkdir -p "$S10_EVID_ROOT" "$S10_EXPORT_ROOT"

printf "%s\n" "$S10_TS" | tee "$S10_EVID_ROOT/ts.txt"
printf "%s\n" "$S10_EVID_ROOT" | tee "$S10_EVID_ROOT/root.txt"
printf "%s\n" "$S10_EXPORT_ROOT" | tee "$S10_EVID_ROOT/export_root.txt"

### 2) Install + Quality gates (app root)
cd "/Users/waheebmahmoud/dev/pro-work/app"

if [ -f package-lock.json ]; then
  npm ci 2>&1 | tee "$S10_EVID_ROOT/install.log"
else
  npm install 2>&1 | tee "$S10_EVID_ROOT/install.log"
fi

npm run lint 2>&1 | tee "$S10_EVID_ROOT/lint.log"
npm run typecheck 2>&1 | tee "$S10_EVID_ROOT/typecheck.log"
npm test 2>&1 | tee "$S10_EVID_ROOT/test.log"

### 3) Runtime (Terminal A, app root)
cd "/Users/waheebmahmoud/dev/pro-work/app"

export APP_PORT="3010"
export BASE_URL="http://127.0.0.1:${APP_PORT}"

npm run dev 2>&1 | tee "$S10_EVID_ROOT/devserver.log"

### 4) Runtime validation (Terminal B, repo root)
cd "/Users/waheebmahmoud/dev/pro-work"

export APP_PORT="3010"
export BASE_URL="http://127.0.0.1:${APP_PORT}"

curl -sS "${BASE_URL}/api/health" | tee "$S10_EVID_ROOT/health.json"
printf "\n" | tee -a "$S10_EVID_ROOT/health.json"

curl -sS -D - "${BASE_URL}/" -o /dev/null | tee "$S10_EVID_ROOT/home_headers.txt"

### 5) Initial exports (repo root)
cd "/Users/waheebmahmoud/dev/pro-work"

rg -n "emergent|genesis|factory|orchestr" . 2>&1 | tee "$S10_EXPORT_ROOT/grep_emergent_signals.txt"

find "docs/sprints" -maxdepth 1 -type f -print | sort | tee "$S10_EXPORT_ROOT/sprints_index.txt"
find "$S10_EVID_ROOT" -type f -maxdepth 1 -print | sort | tee "$S10_EXPORT_ROOT/evidence_index.txt"
