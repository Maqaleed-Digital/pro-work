# WORKCAPTAIN — ANALYTICS EVENT SCHEMA
#
# Status: ACTIVE CONTRACT
# Purpose: canonical analytics schema for product, API, execution, AI, and trust measurement

## 1. Principle

Analytics must be event-driven and contract-governed.

No important business state transition should remain outside event visibility.

## 2. Canonical Envelope

All analytics-capable platform events must resolve to this logical structure:

```json
{
  "event_name": "string",
  "event_family": "string",
  "event_version": "1.0",
  "occurred_at": "UTC timestamp",
  "source_layer": "frontend|api|platform|ai|trust",
  "tenant_id": "string|null",
  "actor_type": "human|agent|system|anonymous",
  "actor_id": "string|null",
  "session_id": "string|null",
  "route": "string|null",
  "correlation_id": "string|null",
  "causation_id": "string|null",
  "entity_type": "string|null",
  "entity_id": "string|null",
  "status": "string|null",
  "metrics": {},
  "dimensions": {},
  "metadata": {}
}
```

## 3. Event Family: User Behavior (frontend)

Source layer: `frontend`

| Event Name | Trigger | Required Dimensions |
|---|---|---|
| page_view | Any page navigation | route, referrer, session_id |
| landing_view | Landing page rendered | route, utm_source, utm_medium, utm_campaign |
| login_view | Login page rendered | route, session_id |
| signup_started | Signup form interaction initiated | route, session_id |
| signup_completed | Signup form successfully submitted | route, session_id, actor_type=anonymous |
| login_success | Successful authentication | route, session_id, actor_type=human |
| dashboard_view | Dashboard route rendered post-login | route, session_id, actor_id |
| primary_action_initiated | First meaningful product action triggered | route, session_id, actor_id, entity_type |
| primary_action_completed | First meaningful product action completed | route, session_id, actor_id, entity_type, entity_id, status |

## 4. Event Family: User Funnel (frontend)

Source layer: `frontend`

Funnel events are derived from user behavior event sequences.
They are computed, not directly emitted.

| Funnel Step | From Event | To Event | Metric Key |
|---|---|---|---|
| landing_to_signup | landing_view | signup_started | landing_to_signup_conversion_rate |
| signup_to_login | signup_completed | login_success | signup_to_login_conversion_rate |
| login_to_dashboard | login_success | dashboard_view | login_to_dashboard_conversion_rate |
| dashboard_to_first_action | dashboard_view | primary_action_completed | dashboard_to_first_action_conversion_rate |

## 5. Event Family: API Analytics (api)

Source layer: `api`

| Event Name | Trigger | Required Fields |
|---|---|---|
| api_request_received | HTTP request enters API handler | route, method, correlation_id, actor_type |
| api_response_sent | HTTP response dispatched | route, method, correlation_id, status, metrics.duration_ms |
| api_error_observed | HTTP 4xx or 5xx response | route, method, correlation_id, status, dimensions.error_code |
| api_latency_recorded | Response time captured | route, method, correlation_id, metrics.duration_ms, metrics.p95_ms |

## 6. Event Family: Platform Execution (platform)

Source layer: `platform`

| Event Name | Entity Type | Required Dimensions |
|---|---|---|
| PROJECT_CREATED | project | tenant_id, actor_id, entity_id |
| WORKSTREAM_CREATED | workstream | tenant_id, actor_id, entity_id, dimensions.project_id |
| MILESTONE_CREATED | milestone | tenant_id, actor_id, entity_id, dimensions.project_id |
| EXECUTION_JOB_CREATED | execution_job | tenant_id, actor_id, entity_id, dimensions.workstream_id |
| EXECUTION_JOB_COMPLETED | execution_job | tenant_id, actor_id, entity_id, status, metrics.duration_ms |
| DELIVERABLE_SUBMITTED | deliverable | tenant_id, actor_id, entity_id, dimensions.milestone_id |
| DELIVERABLE_APPROVED | deliverable | tenant_id, actor_id, entity_id, status=approved |
| MILESTONE_COMPLETED | milestone | tenant_id, actor_id, entity_id, dimensions.project_id, status=completed |

## 7. Event Family: AI + Trust (ai / trust)

Source layer: `ai` or `trust`

| Event Name | Source Layer | Required Dimensions |
|---|---|---|
| AGENT_JOB_COMPLETED | ai | tenant_id, actor_type=agent, actor_id, entity_id, status, metrics.duration_ms |
| PHR_REVIEW_APPROVED | trust | tenant_id, actor_id, entity_id, dimensions.reviewer_id |
| EVIDENCE_PACK_GENERATED | trust | tenant_id, actor_id, entity_id, dimensions.pack_type |
| TRUST_LEDGER_APPENDED | trust | tenant_id, actor_id, entity_id, dimensions.ledger_action |
| TOKEN_ISSUED | trust | tenant_id, actor_id, entity_id, dimensions.token_type |

## 8. Schema Version Policy

- Event schema version is `1.0` for all Phase 89 events
- Schema changes require a version bump and migration runbook
- Breaking changes require a new event name, not a version bump
- All consumers must declare the minimum schema version they support

## 9. Naming Conventions

- Frontend events: `snake_case`
- Platform events: `UPPER_SNAKE_CASE`
- API events: `snake_case`
- AI/Trust events: `UPPER_SNAKE_CASE`
- Dimension keys: `snake_case`
- Metric keys: `snake_case`

## 10. Forbidden Patterns

- No PII in event fields (no email, phone, national ID, password)
- No unconstrained `metadata` blobs without schema definition
- No silent event additions outside this registry
- No events emitted without `occurred_at`
- No events without `source_layer`
