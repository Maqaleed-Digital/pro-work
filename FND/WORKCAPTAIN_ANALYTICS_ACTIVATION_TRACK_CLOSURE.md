# WORKCAPTAIN — ANALYTICS ACTIVATION TRACK CLOSURE
#
# Status: READY FOR EXECUTION
# Applies From: Post-Phase 95 live-shell advancement readiness
# Source of Truth Baseline: ed8c9e8dd2b33c04e2d84950170a0f805a5afe71

## 1. Objective

This closure pack executes the remaining analytics activation track as one governed operator run.

The execution attempts the full chain:

1. env
2. bq
3. auth
4. views
5. query
6. truthful executive KPI output

The runner records only the highest truthful state reached.

## 2. Truth Rule

Only two end conditions are acceptable:

### PASS
A truthful executive KPI output row is returned from the real warehouse.

### BLOCKED
Execution stops at the highest truthful blocked gate with explicit reason.

## 3. Scope

### 3.1 In Scope
- real operator shell validation
- bq CLI validation
- authenticated dataset access validation
- derived view validation
- truthful executive output query execution
- deterministic evidence pack generation

### 3.2 Out of Scope
- fabricated KPI values
- guessed auth state
- hidden environment injection
- undocumented runtime mutation

## 4. Preferred Truthful Output

Required output fields:
- event_date
- daily_active_users
- session_count
- api_request_volume
- milestones_completed_count
- evidence_packs_generated_count

## 5. Success Criteria

This closure pack is complete when:
- runtime requirements are defined
- gate chain is defined
- output registry is defined
- dataset/auth/views/query SQL checks exist
- runner records PASS or explicit BLOCKED state
- evidence is produced
- source-of-truth commit is pushed
