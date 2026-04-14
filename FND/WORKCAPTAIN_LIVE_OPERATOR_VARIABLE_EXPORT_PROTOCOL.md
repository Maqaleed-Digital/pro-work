# WORKCAPTAIN LIVE OPERATOR VARIABLE EXPORT PROTOCOL

## Protocol Identity
- **Protocol**: LIVE_OPERATOR_VARIABLE_EXPORT
- **Phase**: 95
- **Scope**: Operator shell variable provisioning for BQ session activation

## Required Variables
| Variable | Description | Example |
|---|---|---|
| WORKCAPTAIN_BQ_PROJECT_ID | GCP project hosting the BQ dataset | prj-maq-workcaptain-nonprod |
| WORKCAPTAIN_BQ_DATASET | BQ dataset name | workcaptain_analytics |
| GOOGLE_APPLICATION_CREDENTIALS | Path to service account key JSON (optional if ADC active) | /path/to/sa.json |

## Export Procedure
```bash
export WORKCAPTAIN_BQ_PROJECT_ID=<your-project-id>
export WORKCAPTAIN_BQ_DATASET=workcaptain_analytics
# If using service account key:
export GOOGLE_APPLICATION_CREDENTIALS=/path/to/sa-key.json
```

## Verification
The verification script checks for WORKCAPTAIN_BQ_PROJECT_ID and WORKCAPTAIN_BQ_DATASET.
If either is missing, STATUS_CODE=BLOCKED_MISSING_ENV and execution halts at that gate.

## Protocol Constraints
- Variables must be exported in the same shell session as the verification script
- No defaults are assumed for PROJECT_ID
- Dataset default is workcaptain_analytics but must be explicitly exported
