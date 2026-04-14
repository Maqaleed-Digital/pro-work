# WORKCAPTAIN — ANALYTICS OPERATOR HANDOFF
#
# Status: ACTIVE

## 1. Purpose

This document provides the exact operator handoff for truthful KPI execution.

## 2. Required Operator Inputs

- WORKCAPTAIN_BQ_PROJECT_ID
- WORKCAPTAIN_BQ_DATASET
- bq CLI available
- BigQuery access to required raw tables and derived marts

## 3. Expected Truthful Outcome

If the environment is ready, the operator should receive:
- a real daily_active_users result
or
- a clean BLOCKED output with explicit reason

## 4. Evidence Outputs

The execution runner must produce:
- ENV_CHECK.txt
- BQ_TOOL_CHECK.txt
- RAW_TABLE_CHECK.txt
- TRUTHFUL_KPI_OUTPUT.json or BLOCKED reason
- LIVE_READOUT_STATUS.txt
