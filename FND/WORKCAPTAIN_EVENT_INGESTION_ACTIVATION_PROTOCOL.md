# WORKCAPTAIN — EVENT INGESTION ACTIVATION PROTOCOL
#
# Status: ACTIVE CONTRACT

## 1. Purpose

This protocol governs activation of real event ingestion into WorkCaptain analytics raw tables.

## 2. Required Raw Tables

- raw_frontend_events
- raw_platform_events

## 3. Required Event Classes

Frontend:
- page_view
- landing_view
- login_success
- dashboard_view

Platform:
- PROJECT_CREATED
- MILESTONE_COMPLETED
- DELIVERABLE_APPROVED
- EVIDENCE_PACK_GENERATED

## 4. Truth Rule

Only real runtime-emitted events count toward non-empty KPI success.
No synthetic backfill may be presented as production truth in this phase.

## 5. Fail-Closed Rule

If raw event rows are absent, execution remains blocked at ingestion stage.
