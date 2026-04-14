# WORKCAPTAIN — FIRST KPI LIVE READOUT PROTOCOL
#
# Status: ACTIVE

## 1. Purpose

This protocol governs the first truthful KPI readout for WorkCaptain analytics.

## 2. Allowed Outcomes

Only two outcomes are valid:

### PASS
A real KPI value is produced from registered warehouse sources.

### BLOCKED
A readout cannot be produced because one or more required live inputs are missing.

## 3. Forbidden Outcomes

- fabricated KPI values
- guessed KPI values
- placeholder KPI values represented as real

## 4. Minimum Readout Set

Preferred first KPI candidates:
- daily_active_users
- api_request_volume
- projects_created_count
- evidence_packs_generated_count

## 5. Evidence Rule

The readout attempt must record:
- selected KPI
- query path
- dataset/table dependency
- execution status
- output or blocked reason
