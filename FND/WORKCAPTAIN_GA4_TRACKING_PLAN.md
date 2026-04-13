# WORKCAPTAIN — GA4 TRACKING PLAN
#
# Status: ACTIVE CONTRACT
# Purpose: GA4 event instrumentation plan for WorkCaptain frontend

## 1. Tracking Architecture

WorkCaptain uses Google Analytics 4 (GA4) for frontend behavioral analytics.

GA4 event data feeds into BigQuery via the GA4 BigQuery export integration.

Data flow:

```
Browser → GA4 (gtag.js / GTM) → GA4 Property → BigQuery Export → mart_daily_product_kpis
```

## 2. GA4 Property Configuration

| Setting | Value |
|---|---|
| Property Name | WorkCaptain Production |
| Data Stream | workcaptain.ai |
| Enhanced Measurement | page_view, scroll, outbound_click |
| BigQuery Linking | Enabled (daily export) |
| Data Retention | 14 months |
| Signals | Disabled (non-consent mode) |

## 3. Custom Events

All custom events follow GA4 naming conventions: `snake_case`, max 40 characters.

### 3.1 landing_view

**Trigger:** Landing page (`/`) rendered on first paint

| Parameter | Type | Description |
|---|---|---|
| session_id | string | Client-side session identifier |
| utm_source | string | UTM source from URL params |
| utm_medium | string | UTM medium from URL params |
| utm_campaign | string | UTM campaign from URL params |
| referrer | string | `document.referrer` (truncated at 100 chars) |

### 3.2 signup_started

**Trigger:** User interacts with signup form (first keypress or focus on signup page)

| Parameter | Type | Description |
|---|---|---|
| session_id | string | Client-side session identifier |
| route | string | Current route path |
| engagement_time_msec | integer | Time on page before signup start |

### 3.3 signup_completed

**Trigger:** Signup API call returns 200/201 success

| Parameter | Type | Description |
|---|---|---|
| session_id | string | Client-side session identifier |
| route | string | Current route path |

### 3.4 login_success

**Trigger:** Login API call returns 200 success and token received

| Parameter | Type | Description |
|---|---|---|
| session_id | string | Client-side session identifier |
| route | string | Current route path |
| auth_method | string | `password` \| `sso` |

### 3.5 dashboard_view

**Trigger:** Dashboard route rendered after successful auth

| Parameter | Type | Description |
|---|---|---|
| session_id | string | Client-side session identifier |
| route | string | Dashboard route path |
| first_visit | boolean | True if first dashboard visit in session |

### 3.6 primary_action_initiated

**Trigger:** User initiates first core product action (project create, task assign, etc.)

| Parameter | Type | Description |
|---|---|---|
| session_id | string | Client-side session identifier |
| action_type | string | Type of action initiated |
| route | string | Current route path |

### 3.7 primary_action_completed

**Trigger:** Core product action API call returns success

| Parameter | Type | Description |
|---|---|---|
| session_id | string | Client-side session identifier |
| action_type | string | Type of action completed |
| entity_type | string | Type of entity created/updated |
| duration_ms | integer | Time from initiation to completion |

## 4. Enhanced Measurement Events (Auto-Collected)

| Event | Condition |
|---|---|
| page_view | Every route change (SPA navigation included) |
| scroll | 90% scroll depth |
| session_start | New session initialized |
| first_visit | First visit by device |
| user_engagement | Active engagement threshold met |

## 5. GA4 Conversion Events

| Conversion Event | Goal |
|---|---|
| signup_completed | User account creation |
| login_success | User authentication |
| primary_action_completed | First value delivery |

## 6. Funnel Definition in GA4

Funnel report configured as:

1. landing_view
2. signup_started
3. signup_completed
4. login_success
5. dashboard_view
6. primary_action_completed

## 7. User Properties

| Property | Value Source | Description |
|---|---|---|
| tenant_id | Post-auth context | Organisation identifier (non-PII) |
| user_role | Post-auth context | User role within tenant |

## 8. Implementation Notes

- All events use `gtag('event', ...)` or equivalent GA4 SDK call
- `session_id` is generated client-side on session start, stored in sessionStorage
- No PII must be transmitted to GA4 (no email, name, or national ID)
- SPA route changes must trigger `page_view` via router hook
- Events must only fire after cookie consent is obtained (if required by jurisdiction)

## 9. Validation

GA4 DebugView must confirm event receipt before any release with new instrumentation.

Minimum validation checklist:

- [ ] page_view fires on route change
- [ ] landing_view fires on first page load
- [ ] signup_started fires on form interaction
- [ ] signup_completed fires on successful API response
- [ ] login_success fires on successful auth token receipt
- [ ] dashboard_view fires on first post-auth render
- [ ] primary_action_initiated fires on action trigger
- [ ] primary_action_completed fires on action success
