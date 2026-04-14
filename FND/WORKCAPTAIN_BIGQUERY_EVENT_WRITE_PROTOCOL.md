# WORKCAPTAIN — BIGQUERY EVENT WRITE PROTOCOL
#
# Status: ACTIVE CONTRACT

## 1. Purpose

This protocol governs direct application-side writes to BigQuery raw analytics tables.

## 2. Raw Targets

Frontend writes:
- raw_frontend_events

Platform writes:
- raw_platform_events

## 3. Required Environment

Server/runtime must provide:
- WORKCAPTAIN_BQ_PROJECT_ID
- WORKCAPTAIN_BQ_DATASET

Optional:
- GOOGLE_APPLICATION_CREDENTIALS

## 4. Write Rule

All writes must go through a shared writer abstraction.
