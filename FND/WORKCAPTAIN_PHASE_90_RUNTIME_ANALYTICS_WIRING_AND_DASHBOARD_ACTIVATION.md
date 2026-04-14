# WORKCAPTAIN — PHASE 90
# RUNTIME ANALYTICS WIRING + DASHBOARD ACTIVATION + FIRST KPI LIVE READOUT
#
# Status: ACTIVE
# Applies From: Post-Phase 89 governed analytics baseline
# Source of Truth Baseline: 50fb92ad4ee33f76c991743d0cf275f17325f7c1

## 1. Objective

Phase 90 activates the live runtime side of analytics operations for WorkCaptain.

Phase 89 established the governed analytics contracts.
Phase 90 establishes the governed activation layer required to:

- wire runtime analytics only through governed targets
- activate dashboard definitions from event-backed marts
- produce a first KPI live-readout path
- fail closed when required runtime inputs are missing

## 2. Transition

FROM:
- analytics governance defined
- event registries present
- KPI registry present
- warehouse model defined

TO:
- runtime activation targets defined
- dashboard registry defined
- KPI query set defined
- operator-grade live readout script present
- evidence-backed activation readiness established

## 3. Scope

### 3.1 In Scope
- governed runtime activation target registry
- governed dashboard registry
- first KPI query registry
- BigQuery mart SQL definitions
- environment contract for live analytics execution
- fail-closed activation and readout runner
- evidence-backed runtime activation readiness pack

### 3.2 Out of Scope
- mutation of undocumented frontend/backend runtime source files
- silent edits into unknown app entrypoints
- dashboard publishing to external vendors without configured credentials
- fabricated KPI output without warehouse data

## 4. Activation Principle

Runtime analytics may only be activated through:

1. registered event definitions
2. registered runtime targets
3. registered KPI queries
4. registered dashboards
5. explicit environment variables

No silent runtime wiring is allowed.

## 5. Deliverables

This phase must produce:

- Phase 90 execution definition
- runtime analytics wiring protocol
- dashboard activation model
- first KPI live readout protocol
- analytics environment contract
- runtime activation targets registry
- dashboard registry
- first KPI query registry
- mart SQL definitions
- fail-closed activation/readout runner
- evidence pack
- source-of-truth commit

## 6. Success Criteria

Phase 90 is complete when:

- runtime activation targets are defined
- dashboards are defined
- first KPI query set is defined
- mart SQL definitions exist
- fail-closed runner validates all contracts
- evidence pack is generated
- commit is pushed
