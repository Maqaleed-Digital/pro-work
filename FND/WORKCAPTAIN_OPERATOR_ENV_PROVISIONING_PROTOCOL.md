# WORKCAPTAIN — OPERATOR ENV PROVISIONING PROTOCOL
#
# Status: ACTIVE CONTRACT

## 1. Purpose

This protocol governs the operator environment required for truthful KPI execution.

## 2. Required Variables

The operator environment must explicitly provide:

- WORKCAPTAIN_BQ_PROJECT_ID
- WORKCAPTAIN_BQ_DATASET

Optional but commonly required:
- GOOGLE_APPLICATION_CREDENTIALS

## 3. Provisioning Rule

Values must come from the real operator environment.
They must not be guessed, inferred, or embedded into repository files as production values.

## 4. Activation Order

1. export warehouse coordinates
2. validate bq CLI presence
3. validate query access
4. validate raw source tables
5. execute truthful KPI query
6. record evidence

## 5. Fail-Closed Rule

If any required variable is missing, truthful KPI execution must remain BLOCKED.
