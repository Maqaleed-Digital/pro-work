# WORKCAPTAIN — PHASE 91
# BIGQUERY ENV ACTIVATION + LIVE KPI UNBLOCK + FIRST EXECUTIVE DASHBOARD READOUT
#
# Status: ACTIVE
# Applies From: Post-Phase 90 runtime activation readiness
# Source of Truth Baseline: fc5b53f1ed50f117ecba352202bcc8163ce1e8ec

## 1. Objective

Phase 91 activates the warehouse execution layer required for truthful live KPI output.

Phase 90 established the governed activation contracts and correctly returned BLOCKED when warehouse variables were unavailable.
Phase 91 establishes the governed operator pathway required to:

- validate BigQuery environment presence
- validate dataset accessibility
- render and apply KPI mart SQL against explicit warehouse coordinates
- unblock truthful KPI output
- produce the first executive dashboard readout
- fail closed when warehouse, auth, or source tables are missing

## 2. Transition

FROM:
- analytics activation readiness
- runtime wiring contracts
- dashboard registry
- KPI query registry
- first KPI path defined but blocked

TO:
- BigQuery env validated
- dataset activated or confirmed reachable
- mart views rendered against explicit project/dataset
- first KPI live readout attempted truthfully
- first executive dashboard readout generated or explicitly blocked

## 3. Scope

### 3.1 In Scope
- BigQuery environment contract enforcement
- operator-grade dataset activation checks
- rendered KPI mart deployment
- first executive dashboard query deployment
- truthful KPI unblock attempt
- evidence-backed readout output

### 3.2 Out of Scope
- fabricated KPI values
- hidden dataset creation outside explicit operator step
- mutations to undocumented runtime source files
- dashboard publishing to external BI tools without configured credentials

## 4. Success Criteria

Phase 91 is complete when:

- warehouse environment is validated
- dataset check is executed
- rendered SQL files are produced
- mart deployment attempt is recorded
- first KPI readout is attempted
- executive dashboard first readout is attempted
- outcome is PASS or BLOCKED with explicit reason
- evidence is produced
- source-of-truth commit is pushed
