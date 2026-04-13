# WORKCAPTAIN — EXECUTIVE KPI BASELINE
#
# Status: ACTIVE CONTRACT
# Purpose: authoritative KPI definitions, targets, and review cadence for executive reporting

## 1. Principle

Every KPI must be:

- **Defined** — unambiguous calculation method
- **Sourced** — traceable to a governed event or mart table
- **Baselined** — a T0 (launch) value is recorded for all KPIs
- **Targeted** — a 90-day target is set for each KPI
- **Reviewed** — reviewed on a weekly executive cadence

## 2. T0 Baseline Declaration

T0 = Phase 89 execution date (2026-04-13)

At T0, WorkCaptain is live and externally reachable. No paid users yet.
All KPI baselines are set to zero or launch-state values.

## 3. KPI Registry

### 3.1 User KPIs

| KPI ID | Name | Definition | Source | T0 Baseline | 90-Day Target |
|---|---|---|---|---|---|
| U-01 | daily_active_users | Distinct user_pseudo_id in raw_frontend_events per day | mart_daily_product_kpis | 0 | 100 |
| U-02 | session_count | Distinct GA4 sessions per day | mart_daily_product_kpis | 0 | 300 |
| U-03 | avg_session_duration_seconds | Mean session duration across all sessions | mart_daily_product_kpis | 0 | 120 |
| U-04 | bounce_rate | Sessions with single event / total sessions | mart_daily_product_kpis | 0 | ≤0.60 |

### 3.2 Funnel KPIs

| KPI ID | Name | Definition | Source | T0 Baseline | 90-Day Target |
|---|---|---|---|---|---|
| F-01 | landing_to_signup_conversion_rate | signup_started / landing_view sessions | mart_funnel_steps | 0 | ≥0.10 |
| F-02 | signup_to_login_conversion_rate | login_success following signup_completed / signup_completed | mart_funnel_steps | 0 | ≥0.70 |
| F-03 | login_to_dashboard_conversion_rate | dashboard_view / login_success | mart_funnel_steps | 0 | ≥0.90 |
| F-04 | dashboard_to_first_action_conversion_rate | primary_action_completed / dashboard_view | mart_funnel_steps | 0 | ≥0.30 |

### 3.3 API KPIs

| KPI ID | Name | Definition | Source | T0 Baseline | 90-Day Target |
|---|---|---|---|---|---|
| A-01 | api_request_volume | Total HTTP requests to api-service per day | mart_daily_product_kpis | 0 | — |
| A-02 | api_error_rate | (4xx + 5xx responses) / total responses | mart_daily_product_kpis | 0 | ≤0.01 |
| A-03 | api_p95_latency_ms | 95th percentile response time in ms | mart_daily_product_kpis | 0 | ≤500 |
| A-04 | api_endpoint_success_rate | 2xx responses / total responses | mart_daily_product_kpis | 1.0 | ≥0.99 |

### 3.4 Platform Execution KPIs

| KPI ID | Name | Definition | Source | T0 Baseline | 90-Day Target |
|---|---|---|---|---|---|
| P-01 | projects_created_count | PROJECT_CREATED events per day | mart_daily_execution_kpis | 0 | 10 |
| P-02 | milestones_completed_count | MILESTONE_COMPLETED events per day | mart_daily_execution_kpis | 0 | 20 |
| P-03 | deliverables_approved_count | DELIVERABLE_APPROVED events per day | mart_daily_execution_kpis | 0 | 15 |
| P-04 | execution_jobs_completed_count | EXECUTION_JOB_COMPLETED events per day | mart_daily_execution_kpis | 0 | 50 |

### 3.5 AI + Trust KPIs

| KPI ID | Name | Definition | Source | T0 Baseline | 90-Day Target |
|---|---|---|---|---|---|
| T-01 | agent_jobs_completed_count | AGENT_JOB_COMPLETED events per day | mart_daily_trust_kpis | 0 | 30 |
| T-02 | phr_reviews_approved_count | PHR_REVIEW_APPROVED events per day | mart_daily_trust_kpis | 0 | 5 |
| T-03 | evidence_packs_generated_count | EVIDENCE_PACK_GENERATED events per day | mart_daily_trust_kpis | 0 | 10 |
| T-04 | trust_ledger_appends_count | TRUST_LEDGER_APPENDED events per day | mart_daily_trust_kpis | 0 | 20 |
| T-05 | tokens_issued_count | TOKEN_ISSUED events per day | mart_daily_trust_kpis | 0 | 5 |

## 4. Review Cadence

| Cadence | Scope | Audience |
|---|---|---|
| Daily automated | A-02 (api_error_rate), A-03 (api_p95_latency_ms) — alert if threshold breached | On-call engineer |
| Weekly | All 20 KPIs reviewed against targets | Product + Engineering leads |
| Monthly | Funnel KPI trend analysis, cohort retention | Executive team |
| Quarterly | Full KPI baseline reassessment, target revision | Executive + Board |

## 5. Alert Thresholds

The following KPIs trigger automated alerts when breached:

| KPI | Alert Condition | Channel |
|---|---|---|
| A-02 api_error_rate | > 0.05 for any 5-minute window | Cloud Monitoring alert |
| A-03 api_p95_latency_ms | > 2000ms for any 5-minute window | Cloud Monitoring alert |
| U-01 daily_active_users | Drop > 50% vs prior 7-day avg | Weekly digest |
| F-01 landing_to_signup | Drop > 30% vs prior 7-day avg | Weekly digest |

## 6. Governing Rules

- KPI definitions may only be changed via a phase execution with evidence commit
- Target changes require written justification in the evidence pack
- New KPIs may only be added via registry update in `kpi_registry.json`
- Deleted KPIs must be marked `deprecated: true` — never silently removed
- KPI T0 baselines are immutable after Phase 89 commit

## 7. Dashboard

Executive KPI dashboard is defined in the Phase 88 Cloud Monitoring dashboard.
BigQuery-linked Looker Studio report is the authoritative executive view.

Report configuration:

- Data source: `workcaptain_mart.mart_daily_product_kpis` + `mart_daily_execution_kpis` + `mart_daily_trust_kpis`
- Date range control: rolling 30-day default
- Filters: by date, by tenant_id (for multi-tenant view)
