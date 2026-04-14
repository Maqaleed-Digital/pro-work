# WORKCAPTAIN FIRST GATE ADVANCEMENT EXECUTION PROTOCOL

## Protocol Identity
- **Protocol**: FIRST_GATE_ADVANCEMENT_EXECUTION
- **Phase**: 95
- **Scope**: Canonical gate advancement from BLOCKED_MISSING_ENV toward BLOCKED_MISSING_VIEWS

## Gate Chain
```
BLOCKED_MISSING_ENV
  → export WORKCAPTAIN_BQ_PROJECT_ID and WORKCAPTAIN_BQ_DATASET
BLOCKED_MISSING_BQ
  → install bq CLI: gcloud components install bq
BLOCKED_AUTH_FAILURE
  → authenticate: gcloud auth application-default login
BLOCKED_QUERY_FAILURE
  → probe query (SELECT 1) must execute successfully
BLOCKED_MISSING_VIEWS
  → mart views not yet deployed (terminal state for Phase 95)
PASS
  → all gates clear (future phase)
```

## Advancement Execution Rules
- Each gate is evaluated sequentially; failure at any gate halts evaluation
- Gate state is recorded in LIVE_READOUT_STATUS.txt
- Only truthful outcomes are recorded — no gate may be skipped or fabricated
- If env + bq + auth + probe all pass, STATUS_CODE=BLOCKED_MISSING_VIEWS is correct and expected

## Phase 95 Terminal State
BLOCKED_MISSING_VIEWS is the correct terminal state when:
- WORKCAPTAIN_BQ_PROJECT_ID is set
- WORKCAPTAIN_BQ_DATASET is set
- bq CLI is present
- AUTH_OK=1 (SELECT 1 executed successfully)
- PROBE_OK=1 (gate advancement probe executed successfully)
- mart_daily_product_kpis, mart_daily_execution_kpis, mart_daily_trust_kpis views NOT yet deployed

## Evidence Requirements
- ENV_CHECK.txt: variable presence/value
- BQ_TOOL_CHECK.txt: bq CLI status and version
- AUTH_CHECK.txt + AUTH_CHECK.err: auth gate query output
- PROBE_CHECK.txt + PROBE_CHECK.err: gate advancement probe output
- DATASET_CHECK.txt + DATASET_CHECK.err: dataset schema probe output
- LIVE_READOUT_STATUS.txt: STATUS_CODE + gate flags
- GATE_RESULT.txt: human-readable summary
