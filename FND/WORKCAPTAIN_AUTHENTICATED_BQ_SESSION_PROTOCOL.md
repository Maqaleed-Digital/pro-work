# WORKCAPTAIN AUTHENTICATED BQ SESSION PROTOCOL

## Protocol Identity
- **Protocol**: AUTHENTICATED_BQ_SESSION
- **Phase**: 95
- **Scope**: Establishing a verified, authenticated BigQuery CLI session

## Prerequisites
1. gcloud CLI installed and initialized
2. bq CLI present (gcloud components install bq)
3. Authentication active: gcloud auth application-default login OR GOOGLE_APPLICATION_CREDENTIALS set
4. Operator env variables exported (see LIVE_OPERATOR_VARIABLE_EXPORT_PROTOCOL)

## Session Establishment Steps
1. Verify bq CLI is present: `command -v bq`
2. Verify bq version: `bq version`
3. Execute auth gate check: `bq query --nouse_legacy_sql < 011_auth_gate_check.sql`
4. Execute dataset probe: `bq query --nouse_legacy_sql < 014_session_auth_dataset_check.sql`

## Auth Gate Check SQL
```sql
SELECT 1 AS auth_gate_ok;
```
This query requires no dataset access — it verifies BQ API reachability and auth token validity.

## Dataset Probe SQL
```sql
SELECT schema_name
FROM `{{PROJECT_ID}}.region-us.INFORMATION_SCHEMA.SCHEMATA`
WHERE schema_name = '{{DATASET}}';
```
Note: Uses region-us. If the dataset is in me-central2, this query may return 0 rows but not error.
The auth gate check (SELECT 1) is the primary auth signal.

## Session States
| State | Meaning |
|---|---|
| AUTH_OK=1 | bq CLI present, auth token valid, SELECT 1 executed |
| AUTH_OK=0 | bq CLI missing, auth token invalid, or BQ API unreachable |
