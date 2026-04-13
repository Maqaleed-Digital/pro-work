# WORKCAPTAIN — PHASE 89
# PRODUCT ANALYTICS + USER JOURNEY INSTRUMENTATION + EXECUTIVE KPI BASELINE
#
# Status: ACTIVE
# Applies From: Post-Phase 88 live operations
# Source of Truth Baseline: 4c9c8258d44709b768a3a596aee4537c0eaac41e

## 1. Objective

Phase 89 activates the measurable intelligence layer for WorkCaptain.

The platform is already live, routed, monitored, and externally reachable.
This phase establishes the event-driven analytics contract required to measure:

- user behavior
- user journeys and drop-off
- platform execution activity
- AI and trust events
- executive KPIs

This phase is governed by the rule:

**No important business transition should remain unmeasured.**

## 2. Transition

FROM:

- system health visibility
- uptime monitoring
- alerting
- dashboarding for infrastructure

TO:

- product usage visibility
- funnel visibility
- execution intelligence
- trust and AI activity visibility
- executive KPI baseline

## 3. Architecture Rule

Phase 89 follows the platform-wide event-first architecture.

Instrumentation must align to the platform's event model and not devolve into disconnected ad hoc counters.

Measurement layers:

1. Frontend analytics layer
2. API analytics layer
3. Platform event analytics layer
4. Trust and AI event analytics layer
5. KPI aggregation layer

## 4. Scope

### 4.1 In Scope

- frontend behavioral event taxonomy
- route and funnel instrumentation contract
- API request/latency/error instrumentation contract
- platform execution event analytics contract
- AI and trust event analytics contract
- BigQuery warehouse model definition
- executive KPI registry
- evidence-backed execution validation

### 4.2 Out of Scope

- direct code mutation of unknown frontend/backend runtime files
- silent insertion of analytics libraries into undocumented app paths
- dashboard vendor lock-in
- non-governed tracking additions outside registry
- personal data expansion beyond existing product purpose

## 5. Event Families in Scope

### 5.1 User Behavior Events

- page_view
- landing_view
- login_view
- signup_started
- signup_completed
- login_success
- dashboard_view
- primary_action_initiated
- primary_action_completed

### 5.2 Funnel Events

- landing_to_signup
- signup_to_login
- login_to_dashboard
- dashboard_to_first_action

### 5.3 API Analytics Events

- api_request_received
- api_response_sent
- api_error_observed
- api_latency_recorded

### 5.4 Platform Execution Events

- PROJECT_CREATED
- WORKSTREAM_CREATED
- MILESTONE_CREATED
- EXECUTION_JOB_CREATED
- EXECUTION_JOB_COMPLETED
- DELIVERABLE_SUBMITTED
- DELIVERABLE_APPROVED
- MILESTONE_COMPLETED

### 5.5 AI + Trust Events

- AGENT_JOB_COMPLETED
- PHR_REVIEW_APPROVED
- EVIDENCE_PACK_GENERATED
- TRUST_LEDGER_APPENDED
- TOKEN_ISSUED

## 6. KPI Baseline

### 6.1 User KPIs

- daily_active_users
- session_count
- session_duration_seconds
- bounce_rate

### 6.2 Funnel KPIs

- landing_to_signup_conversion_rate
- signup_to_login_conversion_rate
- login_to_dashboard_conversion_rate
- dashboard_to_first_action_conversion_rate

### 6.3 API KPIs

- api_request_volume
- api_error_rate
- api_p95_latency_ms
- api_endpoint_success_rate

### 6.4 Platform KPIs

- projects_created_count
- milestones_completed_count
- deliverables_approved_count
- execution_jobs_completed_count

### 6.5 AI + Trust KPIs

- agent_jobs_completed_count
- phr_reviews_approved_count
- evidence_packs_generated_count
- trust_ledger_appends_count
- tokens_issued_count

## 7. Warehouse Model

BigQuery logical layers:

- raw_frontend_events
- raw_api_events
- raw_platform_events
- mart_daily_product_kpis
- mart_daily_execution_kpis
- mart_daily_trust_kpis
- mart_funnel_steps

## 8. Guardrails

- fail closed on missing event definitions
- fail closed on missing KPI registry
- fail closed on schema drift
- no silent event additions outside registry
- no instrumentation outside governed naming
- no commit without evidence output

## 9. Deliverables

This phase must produce:

- phase definition document
- analytics event schema
- GA4 tracking plan
- BigQuery analytics model
- KPI baseline definition
- governed config registries
- verification runner
- evidence pack
- source-of-truth commit

## 10. Success Criteria

Phase 89 is complete when:

- event taxonomy is defined
- KPI registry is defined
- warehouse model is defined
- verification runner passes
- evidence pack is generated
- commit is pushed
- new source of truth is recorded
