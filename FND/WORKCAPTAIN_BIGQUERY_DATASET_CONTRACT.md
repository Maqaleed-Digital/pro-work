# WORKCAPTAIN — BIGQUERY DATASET CONTRACT
#
# Status: ACTIVE

## 1. Purpose

This contract defines the minimum warehouse objects required for Phase 91 readout.

## 2. Required Raw Sources

- raw_frontend_events
- raw_platform_events

## 3. Required Derived Views

- mart_daily_product_kpis
- mart_daily_execution_kpis
- mart_daily_trust_kpis
- mart_funnel_steps

## 4. Activation Rule

Phase 91 may create or replace derived views only.
It must not invent raw source tables.

## 5. Fail-Closed Rule

If raw source tables are absent, first readout must be BLOCKED with explicit missing table evidence.
