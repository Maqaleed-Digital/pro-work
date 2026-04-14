# WORKCAPTAIN — ANALYTICS ENVIRONMENT CONTRACT
#
# Status: ACTIVE

## 1. Purpose

This contract defines the minimum environment required for live analytics activation.

## 2. Minimum Required Variables

### Warehouse
- WORKCAPTAIN_BQ_PROJECT_ID
- WORKCAPTAIN_BQ_DATASET

### Optional Runtime
- WORKCAPTAIN_GA4_MEASUREMENT_ID
- WORKCAPTAIN_PUBLIC_WEB_URL
- WORKCAPTAIN_PUBLIC_WWW_URL
- WORKCAPTAIN_PUBLIC_API_URL

### Optional CLI
- GOOGLE_APPLICATION_CREDENTIALS

## 3. Fail-Closed Rule

If warehouse variables are missing, first KPI live readout must be marked BLOCKED.

## 4. Endpoint Defaults

Current public endpoints:
- https://workcaptain.ai
- https://www.workcaptain.ai
- https://api.workcaptain.ai
