# WORKCAPTAIN — AUTHENTICATED BQ READOUT PROTOCOL
#
# Status: ACTIVE CONTRACT

## 1. Purpose

This protocol governs authenticated BigQuery readout for WorkCaptain executive analytics.

## 2. Required Preconditions

The operator environment must provide:

- WORKCAPTAIN_BQ_PROJECT_ID
- WORKCAPTAIN_BQ_DATASET
- bq CLI installed and callable
- authenticated access to the target project and dataset

## 3. Required Warehouse Objects

Derived views required for executive output:

- mart_daily_product_kpis
- mart_daily_execution_kpis
- mart_daily_trust_kpis

## 4. Readout Rule

A truthful executive readout may proceed only when all required derived views are reachable.

## 5. Fail-Closed Rule

If authentication, dataset access, or view access fails, output must remain BLOCKED.
