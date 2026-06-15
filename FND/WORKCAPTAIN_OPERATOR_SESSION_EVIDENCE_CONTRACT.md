# WORKCAPTAIN OPERATOR SESSION EVIDENCE CONTRACT

## Contract Identity
- **Contract**: OPERATOR_SESSION_EVIDENCE
- **Phase**: 95
- **Scope**: Evidence artifact requirements for live operator BQ session execution

## Mandatory Evidence Artifacts
| File | Description | Required |
|---|---|---|
| RUN_CONTEXT.txt | Phase scope, timestamp, repo HEAD, branch | YES |
| JSON_VALIDATION.txt | JSON parse results for all config files | YES |
| ENV_CHECK.txt | PRESENT_ENV or MISSING_ENV per variable | YES |
| BQ_TOOL_CHECK.txt | BQ_CLI_STATUS + version | YES |
| AUTH_CHECK.txt | bq query output for SELECT 1 | YES |
| AUTH_CHECK.err | stderr for auth gate query | YES |
| PROBE_CHECK.txt | bq query output for gate advancement probe | CONDITIONAL (if AUTH_OK=1) |
| PROBE_CHECK.err | stderr for gate advancement probe | CONDITIONAL |
| DATASET_CHECK.txt | bq query output for dataset schema probe | CONDITIONAL (if AUTH_OK=1) |
| DATASET_CHECK.err | stderr for dataset schema probe | CONDITIONAL |
| LIVE_READOUT_STATUS.txt | STATUS_CODE, AUTH_OK, PROBE_OK flags | YES |
| GATE_RESULT.txt | Human-readable gate summary | YES |
| DOC_SPOTCHECK.txt | grep evidence from FND docs and config | YES |
| FND_INVENTORY.txt | find output of FND/ directory | YES |
| CONFIG_INVENTORY.txt | find output of config/analytics/ | YES |
| SQL_INVENTORY.txt | find output of analytics/sql/ | YES |
| MANIFEST.sha256 | shasum -a 256 of all source artifacts | YES |

## Contract Constraints
- All evidence files are created empty (touch/redirect) before population
- No evidence file may be omitted regardless of gate outcome
- Evidence directory is committed with git add -f
- MANIFEST.sha256 covers source files, not evidence files themselves
