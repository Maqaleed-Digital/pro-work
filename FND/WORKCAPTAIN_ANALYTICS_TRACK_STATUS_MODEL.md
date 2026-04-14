# WORKCAPTAIN — ANALYTICS TRACK STATUS MODEL
#
# Status: ACTIVE

## 1. Allowed Status Codes

- BLOCKED_MISSING_ENV
- BLOCKED_MISSING_BQ
- BLOCKED_AUTH_FAILURE
- BLOCKED_MISSING_VIEWS
- BLOCKED_QUERY_FAILURE
- PASS

## 2. Gate Order

env → bq → auth → views → query → PASS

## 3. Truth Rule

A later state may never be reported if an earlier prerequisite is not truthfully satisfied.
