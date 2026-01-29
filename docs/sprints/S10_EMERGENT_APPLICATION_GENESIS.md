# Sprint S10 — Emergent Application Genesis

## Sprint Intent
Stand up Sprint S10 execution spine to run “Emergent Application Genesis” in a repeatable, evidence-backed way.
Outputs include an Emergent-ready spec, a runbook, and an evidence pack structure aligned with prior sprints.

## Working Assumptions
- Repo: /Users/waheebmahmoud/dev/pro-work
- App root: /Users/waheebmahmoud/dev/pro-work/app
- Runtime defaults: APP_PORT=3010, BASE_URL=http://127.0.0.1:3010

## Definition of Done (DoD)
1) Sprint S10 evidence root created at evidence/sprintS10/<UTC_TS> with:
   - ts.txt
   - root.txt
   - export_root.txt
2) Quality gates executed from app/ and logged:
   - install.log
   - lint.log
   - typecheck.log
   - test.log
3) Runtime started and health captured:
   - devserver.log
   - health.json
   - home_headers.txt
4) Emergent execution spec exists:
   - docs/sprints/S10_EMERGENT_EXECUTION_SPEC.md
5) Branch pushed:
   - sprint/S10-emergent-application-genesis

## Evidence Checklist
- evidence/sprintS10/<UTC_TS>/ts.txt
- evidence/sprintS10/<UTC_TS>/root.txt
- evidence/sprintS10/<UTC_TS>/export_root.txt
- evidence/sprintS10/<UTC_TS>/install.log
- evidence/sprintS10/<UTC_TS>/lint.log
- evidence/sprintS10/<UTC_TS>/typecheck.log
- evidence/sprintS10/<UTC_TS>/test.log
- evidence/sprintS10/<UTC_TS>/devserver.log
- evidence/sprintS10/<UTC_TS>/health.json
- evidence/sprintS10/<UTC_TS>/home_headers.txt

## Primary Commands
All repo-level commands must be executed from:
cd "/Users/waheebmahmoud/dev/pro-work"

All node/app commands must be executed from:
cd "/Users/waheebmahmoud/dev/pro-work/app"

### Branch
git checkout -b "sprint/S10-emergent-application-genesis"

### Evidence roots
export S10_TS="$(date -u +%Y%m%dT%H%M%SZ)"
export S10_EVID_ROOT="/Users/waheebmahmoud/dev/pro-work/evidence/sprintS10/${S10_TS}"
export S10_EXPORT_ROOT="/Users/waheebmahmoud/dev/pro-work/exports/sprint-s10/${S10_TS}"

### Install & Quality
If package-lock.json exists:
npm ci
If no lockfile exists:
npm install

Then:
npm run lint
npm run typecheck
npm test

### Runtime
export APP_PORT="3010"
export BASE_URL="http://127.0.0.1:${APP_PORT}"
npm run dev

### Health
curl -sS "${BASE_URL}/api/health"
curl -sS -D - "${BASE_URL}/" -o /dev/null
