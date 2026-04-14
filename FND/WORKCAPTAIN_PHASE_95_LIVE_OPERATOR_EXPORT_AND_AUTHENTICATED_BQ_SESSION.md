# WORKCAPTAIN PHASE 95: LIVE OPERATOR VARIABLE EXPORT AND AUTHENTICATED BQ SESSION

## Phase Identity
- **Phase**: 95
- **Scope**: LIVE_OPERATOR_EXPORT_AUTHENTICATED_BQ_SESSION_FIRST_GATE_ADVANCEMENT
- **Baseline Commit**: 99c470aec6d1912a79b32f00d9086521db1dca32
- **Branch**: sprint/phase11-permission-bound-operational-control

## Purpose
Execute live operator variable export, establish an authenticated BigQuery session, and execute the first gate advancement. If env + bq + auth + probe all pass truthfully, the gate advances to BLOCKED_MISSING_VIEWS (views not yet deployed — correct by design).

## Gate Advancement Order
1. BLOCKED_MISSING_ENV → operator exports WORKCAPTAIN_BQ_PROJECT_ID and WORKCAPTAIN_BQ_DATASET
2. BLOCKED_MISSING_BQ → operator installs bq CLI (gcloud components install bq)
3. BLOCKED_AUTH_FAILURE → operator authenticates (gcloud auth application-default login)
4. BLOCKED_QUERY_FAILURE → probe query executes successfully
5. BLOCKED_MISSING_VIEWS → mart views not yet deployed (this phase's terminal state if all prior gates pass)
6. PASS → all gates clear (future phase)

## Execution Guardrails
- Fail-closed: set -euo pipefail
- No fabricated output: PASS or BLOCKED only
- Evidence committed to git with git add -f
- No mutations to undocumented runtime source files

## Deliverables
- 5 FND governance documents
- 4 config/analytics JSON and example files
- 2 analytics/sql files
- 1 verification script
- Evidence directory committed to branch
