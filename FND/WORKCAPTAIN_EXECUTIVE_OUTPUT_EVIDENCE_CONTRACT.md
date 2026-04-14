# WORKCAPTAIN — EXECUTIVE OUTPUT EVIDENCE CONTRACT
#
# Status: ACTIVE

## 1. Purpose

This contract defines the evidence outputs for truthful executive KPI execution.

## 2. Required Evidence Files

- ENV_CHECK.txt
- BQ_TOOL_CHECK.txt
- AUTH_CHECK.txt
- DERIVED_VIEW_CHECK.txt
- EXECUTIVE_KPI_OUTPUT.json or blocked evidence
- LIVE_READOUT_STATUS.txt

## 3. Truth Rule

If EXECUTIVE_KPI_OUTPUT.json exists as a PASS artifact, it must come directly from a real bq query result.

## 4. Fail-Closed Rule

If PASS cannot be established truthfully, blocked evidence must explain why.
