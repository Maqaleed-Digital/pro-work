# WORKCAPTAIN — TRUTHFUL EXECUTIVE OUTPUT PROTOCOL
#
# Status: ACTIVE

## 1. Purpose

This protocol governs the final truthful executive KPI output attempt.

## 2. Required Output Fields

- event_date
- daily_active_users
- session_count
- api_request_volume
- milestones_completed_count
- evidence_packs_generated_count

## 3. Truth Rule

A PASS result may only be recorded when output is returned directly from the real warehouse query.

## 4. Forbidden Outcomes

- fabricated output
- placeholder sample rows presented as real
- guessed KPI values

## 5. Block Rule

If the query cannot be executed truthfully, execution remains BLOCKED at the highest truthful failed gate.
