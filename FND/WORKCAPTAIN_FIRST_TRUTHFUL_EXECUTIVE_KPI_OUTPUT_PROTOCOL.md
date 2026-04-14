# WORKCAPTAIN — FIRST TRUTHFUL EXECUTIVE KPI OUTPUT PROTOCOL
#
# Status: ACTIVE

## 1. Purpose

This protocol governs the first truthful executive KPI output.

## 2. Truth Rule

Only two outcomes are valid:

### PASS
A real executive KPI output row is returned from actual warehouse views.

### BLOCKED
A real executive KPI output row cannot be returned because one or more preconditions are missing.

## 3. Forbidden Outcomes

- fabricated KPI values
- placeholder sample rows presented as real
- guessed outputs based on assumptions

## 4. Preferred Output Fields

- event_date
- daily_active_users
- session_count
- api_request_volume
- milestones_completed_count
- evidence_packs_generated_count

## 5. Evidence Rule

The execution attempt must record:
- selected SQL path
- operator runtime status
- output row or blocked reason
