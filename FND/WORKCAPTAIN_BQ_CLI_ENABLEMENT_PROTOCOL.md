# WORKCAPTAIN — BQ CLI ENABLEMENT PROTOCOL
#
# Status: ACTIVE CONTRACT

## 1. Purpose

This protocol governs bq CLI availability for truthful KPI execution.

## 2. Required Tool

- bq

## 3. Minimum Capability

The operator environment must support:
- `bq version`
- `bq query --nouse_legacy_sql`

## 4. Authentication Rule

The operator environment must already be authenticated for the target project and dataset.
This phase does not guess or fake authentication state.

## 5. Fail-Closed Rule

If bq is unavailable or unauthenticated, execution must return BLOCKED with explicit evidence.
