# WORKCAPTAIN — BIGQUERY OPERATOR ACTIVATION PROTOCOL
#
# Status: ACTIVE CONTRACT

## 1. Purpose

This protocol governs BigQuery activation for WorkCaptain analytics.

## 2. Required Environment

The operator environment must explicitly provide:

- WORKCAPTAIN_BQ_PROJECT_ID
- WORKCAPTAIN_BQ_DATASET

Optional but commonly required:
- GOOGLE_APPLICATION_CREDENTIALS

## 3. Required Tooling

At least one of the following must be available and authenticated:

- bq CLI
- gcloud CLI with BigQuery access

## 4. Activation Order

1. validate environment variables
2. validate CLI presence
3. confirm dataset reachability
4. render SQL using explicit project/dataset
5. apply views
6. run first KPI query
7. run first executive dashboard readout query
8. record evidence

## 5. Fail-Closed Rule

If any prerequisite is missing, activation must stop and record BLOCKED with explicit reason.
