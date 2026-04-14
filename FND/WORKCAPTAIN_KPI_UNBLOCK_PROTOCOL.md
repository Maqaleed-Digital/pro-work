# WORKCAPTAIN — KPI UNBLOCK PROTOCOL
#
# Status: ACTIVE

## 1. Purpose

This protocol governs how KPI readout moves from BLOCKED to PASS.

## 2. Unblock Requirements

A KPI readout is unblocked only when all conditions are true:

- WORKCAPTAIN_BQ_PROJECT_ID is set
- WORKCAPTAIN_BQ_DATASET is set
- authenticated BigQuery access is available
- required raw source tables exist
- derived views are deployed successfully

## 3. Truth Rule

If these conditions are not fully satisfied, output must remain BLOCKED.

## 4. Preferred First KPI

Preferred first KPI for unblock:
- daily_active_users

Secondary allowed KPIs:
- api_request_volume
- projects_created_count
- evidence_packs_generated_count
