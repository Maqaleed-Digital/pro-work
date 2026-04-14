# WORKCAPTAIN — STATUS ADVANCEMENT GATE MODEL
#
# Status: ACTIVE

## 1. Purpose

This document standardizes deterministic advancement through the operator analytics gate chain.

## 2. Allowed Gate States

- BLOCKED_MISSING_ENV
- BLOCKED_MISSING_BQ
- BLOCKED_AUTH_FAILURE
- BLOCKED_MISSING_VIEWS
- BLOCKED_QUERY_FAILURE
- PASS

## 3. Advancement Rule

The highest truthful state reached is the only valid reported state.

## 4. Required Advancement Order

env → bq → auth → views → query → PASS

## 5. Truth Rule

A later gate may never be reported as passed if an earlier gate is not truthfully satisfied.
