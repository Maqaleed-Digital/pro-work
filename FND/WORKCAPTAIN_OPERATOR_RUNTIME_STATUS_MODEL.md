# WORKCAPTAIN — OPERATOR RUNTIME STATUS MODEL
#
# Status: ACTIVE

## 1. Purpose

This document standardizes runtime outcome labels for operator analytics execution.

## 2. Allowed Status Codes

- PASS
- BLOCKED_MISSING_ENV
- BLOCKED_MISSING_BQ
- BLOCKED_AUTH_FAILURE
- BLOCKED_MISSING_VIEWS
- BLOCKED_QUERY_FAILURE

## 3. Reporting Rule

Every Phase 93 execution must end in exactly one runtime status code.

## 4. Truth Rule

Status codes must reflect actual operator execution conditions only.
