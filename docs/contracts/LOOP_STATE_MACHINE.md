# Marketplace Loop State Machine — Sprint S7

## Entities
- Job
- Provider
- Match
- Assignment

## Assignment States (Minimum Product Contract)
- CREATED
- MATCHED
- COMPLETED
- CANCELLED

## Allowed Transitions
- CREATED -> MATCHED
- MATCHED -> COMPLETED
- CREATED -> CANCELLED
- MATCHED -> CANCELLED

## Invariants
- COMPLETED is terminal
- CANCELLED is terminal
- Completing requires MATCHED
- Transition operations must be idempotent where possible
