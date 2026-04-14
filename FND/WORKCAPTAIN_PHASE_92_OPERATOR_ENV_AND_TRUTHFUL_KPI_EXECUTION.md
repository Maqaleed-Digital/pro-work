# WORKCAPTAIN — PHASE 92
# OPERATOR ENV PROVISIONING + BQ CLI ENABLEMENT + FIRST TRUTHFUL KPI READOUT EXECUTION
#
# Status: ACTIVE
# Applies From: Post-Phase 91 warehouse activation readiness
# Source of Truth Baseline: e96b0b693a74065f7890232d8a106d3aff437546

## 1. Objective

Phase 92 activates the operator environment required to execute a truthful KPI readout.

Phase 91 established the warehouse activation pathway and correctly returned BLOCKED when the operator environment was incomplete.
Phase 92 establishes the governed operator execution layer required to:

- validate operator environment variables
- validate bq CLI presence and basic availability
- validate raw source table presence
- render and execute the first truthful KPI query
- produce evidence-backed PASS or BLOCKED output
- hand off the exact operator requirements without guessing

## 2. Transition

FROM:
- BigQuery activation path defined
- KPI unblock protocol defined
- truthful readout pathway defined but blocked

TO:
- operator environment contract explicit
- bq CLI enablement checks explicit
- truthful KPI execution query explicit
- first truthful KPI readout attempted under operator controls
- PASS or BLOCKED evidence recorded

## 3. Scope

### 3.1 In Scope
- operator environment contract
- bq CLI enablement checks
- truthful KPI execution registry
- operator env example file
- truthful KPI SQL query
- required raw tables check query
- fail-closed execution runner
- evidence-backed operator handoff

### 3.2 Out of Scope
- fabricated KPI output
- silent installation assumptions
- undocumented runtime code mutation
- inferred warehouse coordinates

## 4. Preferred First KPI

Preferred first truthful KPI:
- daily_active_users

Secondary acceptable truthful KPIs:
- api_request_volume
- projects_created_count
- evidence_packs_generated_count

## 5. Success Criteria

Phase 92 is complete when:

- operator environment files are defined
- bq CLI checks are defined
- truthful KPI query exists
- execution runner validates pass or blocked truthfully
- evidence is produced
- source-of-truth commit is pushed
