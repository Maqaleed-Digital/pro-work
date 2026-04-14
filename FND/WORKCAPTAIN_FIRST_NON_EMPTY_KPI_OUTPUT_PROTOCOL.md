# WORKCAPTAIN — FIRST NON-EMPTY KPI OUTPUT PROTOCOL
#
# Status: ACTIVE

## 1. Purpose

This protocol governs the first non-empty executive KPI output.

## 2. PASS Condition

PASS requires:
- at least one raw event row present
- marts recomputed successfully
- executive output query returns at least one row

## 3. BLOCKED Conditions

- BLOCKED_NO_RAW_EVENTS
- BLOCKED_EMPTY_MARTS
- BLOCKED_EMPTY_EXECUTIVE_OUTPUT
- BLOCKED_QUERY_FAILURE

## 4. Truth Rule

An empty result set is not PASS.
