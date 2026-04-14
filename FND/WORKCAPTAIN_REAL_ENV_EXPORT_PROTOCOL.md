# WORKCAPTAIN — REAL ENV EXPORT PROTOCOL
#
# Status: ACTIVE CONTRACT

## 1. Purpose

This protocol governs export of the real operator environment for analytics execution.

## 2. Required Environment Variables

- WORKCAPTAIN_BQ_PROJECT_ID
- WORKCAPTAIN_BQ_DATASET

Optional but commonly required:
- GOOGLE_APPLICATION_CREDENTIALS

## 3. Truth Rule

Environment values must come from the real operator shell and must not be guessed or hard-coded as production values in repository files.

## 4. Pass Condition

The env gate passes only when all required variables are present and non-empty in the live operator shell.

## 5. Fail-Closed Rule

If required variables are missing, advancement stops at BLOCKED_MISSING_ENV.
