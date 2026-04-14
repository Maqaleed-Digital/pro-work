# WORKCAPTAIN — BQ ACCESS ACTIVATION PROTOCOL
#
# Status: ACTIVE CONTRACT

## 1. Purpose

This protocol governs activation of BigQuery access for analytics execution.

## 2. Required Tooling

- bq CLI callable from the live operator shell

## 3. Required Access

The operator shell must be authenticated for the target project and dataset.

## 4. Pass Conditions

The gate chain may advance only when:
- bq exists
- dataset access succeeds
- required views are reachable
- query execution succeeds

## 5. Fail-Closed Rule

If any access step fails, the highest truthful gate reached must be recorded and execution must stop there.
