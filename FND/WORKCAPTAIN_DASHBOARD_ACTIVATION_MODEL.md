# WORKCAPTAIN — DASHBOARD ACTIVATION MODEL
#
# Status: ACTIVE CONTRACT

## 1. Purpose

This document defines the dashboard model for WorkCaptain analytics activation.

## 2. Dashboard Families

### Executive Overview
Purpose:
single-pane daily operational KPI view.

Widgets:
- daily_active_users
- session_count
- api_request_volume
- milestones_completed_count
- evidence_packs_generated_count

### Funnel Dashboard
Purpose:
track user movement from landing to first action.

Widgets:
- landing_to_signup_conversion_rate
- signup_to_login_conversion_rate
- login_to_dashboard_conversion_rate
- dashboard_to_first_action_conversion_rate

### Platform Execution Dashboard
Purpose:
track work execution throughput.

Widgets:
- projects_created_count
- execution_jobs_completed_count
- deliverables_approved_count
- milestones_completed_count

### AI + Trust Dashboard
Purpose:
track AI and trust activity.

Widgets:
- agent_jobs_completed_count
- phr_reviews_approved_count
- trust_ledger_appends_count
- tokens_issued_count

## 3. Source Rule

Every dashboard widget must be backed by:
- registered KPI
- registered SQL query or mart
- event-backed warehouse source

## 4. First Readout Rule

Phase 90 requires the ability to produce at least one truthful KPI live readout or a blocked status explaining why the readout could not be produced.
