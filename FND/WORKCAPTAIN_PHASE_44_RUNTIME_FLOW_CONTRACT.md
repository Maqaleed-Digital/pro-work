# WORKCAPTAIN / PROWORK — PHASE 44 RUNTIME FLOW CONTRACT

## Flow contract
The runtime created in Phase 44 must enforce the following business sequence:

1. Intake submitted
2. Intake validated
3. Intake persisted
4. Opportunity materialized
5. Command-center state recalculated
6. Domain events appended
7. Browser-visible state returned

## Invalidity rules
Reject intake when any of the following are missing:
- tenantId
- requesterId
- title
- summary

Reject intake when:
- title length < 3
- summary length < 10

## Event contract
Each successful intake must append, at minimum:
- INTAKE_CREATED
- OPPORTUNITY_REGISTERED
- COMMAND_CENTER_STATE_UPDATED

## Persistence contract
Runtime state is stored locally in:
prowork_runtime/api/data/phase44-runtime.json

This file is demo-safe, deterministic, and resettable for evidence generation.
