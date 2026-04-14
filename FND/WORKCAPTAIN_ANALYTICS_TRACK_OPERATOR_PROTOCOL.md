# WORKCAPTAIN — ANALYTICS TRACK OPERATOR PROTOCOL
#
# Status: ACTIVE CONTRACT

## 1. Purpose

This protocol governs the live operator execution of the analytics activation track.

## 2. Required Environment

The live shell must provide:
- WORKCAPTAIN_BQ_PROJECT_ID
- WORKCAPTAIN_BQ_DATASET

Optional:
- GOOGLE_APPLICATION_CREDENTIALS

## 3. Required Tooling

- bq CLI available in PATH

## 4. Required Warehouse Reachability

The live shell must be able to access:
- target dataset
- mart_daily_product_kpis
- mart_daily_execution_kpis
- mart_daily_trust_kpis

## 5. Fail-Closed Rule

If any prerequisite is missing, the runner stops at the highest truthful blocked state.
