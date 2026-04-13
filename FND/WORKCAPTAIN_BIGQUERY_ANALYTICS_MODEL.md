# WORKCAPTAIN — BIGQUERY ANALYTICS MODEL
#
# Status: ACTIVE CONTRACT
# Purpose: BigQuery warehouse layer definitions for WorkCaptain product analytics

## 1. Architecture

WorkCaptain analytics uses a layered BigQuery model:

```
Source Systems
  ├── GA4 BigQuery Export (frontend events)
  ├── Cloud Run structured logs (API events)
  └── Platform event stream (platform + AI + trust events)

Raw Layer
  ├── raw_frontend_events
  ├── raw_api_events
  └── raw_platform_events

Mart Layer
  ├── mart_daily_product_kpis
  ├── mart_daily_execution_kpis
  ├── mart_daily_trust_kpis
  └── mart_funnel_steps
```

## 2. Dataset Configuration

| Dataset | Location | Retention | Purpose |
|---|---|---|---|
| `workcaptain_raw` | `me-central2` | 90 days | Raw ingest from all sources |
| `workcaptain_mart` | `me-central2` | 365 days | Aggregated KPI marts |
| `workcaptain_ga4_export` | `me-central2` | 365 days | GA4 BigQuery linked export |

## 3. Raw Layer Table Schemas

### 3.1 `raw_frontend_events`

Source: GA4 BigQuery export (`events_*` daily shards)

| Column | Type | Description |
|---|---|---|
| event_date | DATE | Partition date |
| event_timestamp | INT64 | Microseconds since epoch |
| event_name | STRING | GA4 event name |
| event_params | ARRAY<STRUCT<key STRING, value STRUCT<...>>> | GA4 event parameters |
| user_pseudo_id | STRING | GA4 anonymous user ID |
| session_id | STRING | Extracted from event_params |
| geo.country | STRING | Country from GA4 |
| geo.region | STRING | Region from GA4 |
| device.category | STRING | desktop/mobile/tablet |
| traffic_source.source | STRING | Traffic source |
| traffic_source.medium | STRING | Traffic medium |
| traffic_source.name | STRING | Campaign name |

Partition: `event_date`
Cluster: `event_name`

### 3.2 `raw_api_events`

Source: Cloud Run structured logs (Cloud Logging → BigQuery sink)

| Column | Type | Description |
|---|---|---|
| log_date | DATE | Partition date |
| timestamp | TIMESTAMP | Request timestamp |
| http_request.request_method | STRING | GET/POST/etc |
| http_request.request_url | STRING | Full request URL |
| http_request.status | INT64 | HTTP response status |
| http_request.latency | FLOAT64 | Response latency in seconds |
| http_request.user_agent | STRING | Request user agent |
| labels.service_name | STRING | Cloud Run service name (api-service/web-service) |
| labels.revision_name | STRING | Cloud Run revision |
| correlation_id | STRING | X-Correlation-ID header |
| severity | STRING | Log severity |

Partition: `log_date`
Cluster: `labels.service_name`, `http_request.status`

### 3.3 `raw_platform_events`

Source: Platform event stream (Pub/Sub → BigQuery subscription)

| Column | Type | Description |
|---|---|---|
| event_date | DATE | Partition date |
| occurred_at | TIMESTAMP | Event occurrence timestamp |
| event_name | STRING | Platform event name |
| event_family | STRING | Event family category |
| event_version | STRING | Schema version |
| source_layer | STRING | platform/ai/trust |
| tenant_id | STRING | Tenant identifier |
| actor_type | STRING | human/agent/system |
| actor_id | STRING | Actor identifier |
| entity_type | STRING | Entity type |
| entity_id | STRING | Entity identifier |
| status | STRING | Event outcome status |
| correlation_id | STRING | Correlation chain ID |
| causation_id | STRING | Causation chain ID |
| metrics_json | STRING | JSON-encoded metrics map |
| dimensions_json | STRING | JSON-encoded dimensions map |

Partition: `event_date`
Cluster: `event_name`, `tenant_id`

## 4. Mart Layer Table Schemas

### 4.1 `mart_daily_product_kpis`

| Column | Type | Description |
|---|---|---|
| kpi_date | DATE | Aggregation date |
| daily_active_users | INT64 | Distinct user_pseudo_id count |
| session_count | INT64 | Distinct session count |
| avg_session_duration_seconds | FLOAT64 | Mean session duration |
| bounce_rate | FLOAT64 | Sessions with single page_view / total sessions |
| page_views | INT64 | Total page_view events |
| signups_started | INT64 | Count of signup_started events |
| signups_completed | INT64 | Count of signup_completed events |
| logins_succeeded | INT64 | Count of login_success events |
| dashboard_views | INT64 | Count of dashboard_view events |
| primary_actions_completed | INT64 | Count of primary_action_completed events |
| api_request_volume | INT64 | Total API requests (from raw_api_events) |
| api_error_count | INT64 | 4xx+5xx API responses |
| api_error_rate | FLOAT64 | api_error_count / api_request_volume |
| api_p95_latency_ms | FLOAT64 | 95th percentile API latency in ms |

Partition: `kpi_date`

### 4.2 `mart_daily_execution_kpis`

| Column | Type | Description |
|---|---|---|
| kpi_date | DATE | Aggregation date |
| tenant_id | STRING | Tenant identifier |
| projects_created | INT64 | PROJECT_CREATED events |
| workstreams_created | INT64 | WORKSTREAM_CREATED events |
| milestones_created | INT64 | MILESTONE_CREATED events |
| milestones_completed | INT64 | MILESTONE_COMPLETED events |
| execution_jobs_created | INT64 | EXECUTION_JOB_CREATED events |
| execution_jobs_completed | INT64 | EXECUTION_JOB_COMPLETED events |
| deliverables_submitted | INT64 | DELIVERABLE_SUBMITTED events |
| deliverables_approved | INT64 | DELIVERABLE_APPROVED events |
| avg_job_duration_ms | FLOAT64 | Mean execution job duration |

Partition: `kpi_date`
Cluster: `tenant_id`

### 4.3 `mart_daily_trust_kpis`

| Column | Type | Description |
|---|---|---|
| kpi_date | DATE | Aggregation date |
| tenant_id | STRING | Tenant identifier |
| agent_jobs_completed | INT64 | AGENT_JOB_COMPLETED events |
| phr_reviews_approved | INT64 | PHR_REVIEW_APPROVED events |
| evidence_packs_generated | INT64 | EVIDENCE_PACK_GENERATED events |
| trust_ledger_appends | INT64 | TRUST_LEDGER_APPENDED events |
| tokens_issued | INT64 | TOKEN_ISSUED events |
| avg_agent_duration_ms | FLOAT64 | Mean agent job duration |

Partition: `kpi_date`
Cluster: `tenant_id`

### 4.4 `mart_funnel_steps`

| Column | Type | Description |
|---|---|---|
| funnel_date | DATE | Aggregation date |
| funnel_step | STRING | Funnel step name |
| step_order | INT64 | Step sequence number |
| sessions_entered | INT64 | Sessions that reached this step |
| conversion_rate | FLOAT64 | sessions_entered / previous step sessions_entered |
| drop_off_rate | FLOAT64 | 1 - conversion_rate |

Partition: `funnel_date`

## 5. Scheduled Queries

| Query Name | Schedule | Source → Target |
|---|---|---|
| daily_product_kpis | 02:00 UTC daily | raw_frontend_events + raw_api_events → mart_daily_product_kpis |
| daily_execution_kpis | 02:15 UTC daily | raw_platform_events → mart_daily_execution_kpis |
| daily_trust_kpis | 02:30 UTC daily | raw_platform_events → mart_daily_trust_kpis |
| funnel_steps | 03:00 UTC daily | raw_frontend_events → mart_funnel_steps |

## 6. Access Control

| Role | Datasets | Permission |
|---|---|---|
| Analytics Viewer | workcaptain_mart | roles/bigquery.dataViewer |
| Analytics Engineer | workcaptain_raw, workcaptain_mart | roles/bigquery.dataEditor |
| Data Admin | all | roles/bigquery.admin |
| Service Account (logging sink) | workcaptain_raw | roles/bigquery.dataEditor |

## 7. Cost Controls

- All raw tables partitioned by date — queries must include date filter
- Mart tables are small by design — no partition filter required
- Slot reservations: use on-demand for initial phase; reserve if query volume exceeds 10 TB/day
