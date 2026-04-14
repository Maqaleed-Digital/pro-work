# WORKCAPTAIN — FIRST TRUTHFUL KPI EXECUTION PROTOCOL
#
# Status: ACTIVE

## 1. Purpose

This protocol governs the first truthful KPI execution for WorkCaptain.

## 2. Truth Rule

Only one of the following outcomes is allowed:

### PASS
A real KPI value is returned from the actual warehouse.

### BLOCKED
A real KPI value cannot be returned because one or more prerequisites are missing.

## 3. Forbidden Outcomes

- fabricated KPI values
- placeholder KPI values presented as real
- guessed warehouse results

## 4. Preferred Query

The preferred first truthful KPI query is:
- daily_active_users from mart_daily_product_kpis

## 5. Evidence Rule

The execution attempt must record:
- selected KPI
- SQL path
- warehouse coordinates
- output or blocked reason
