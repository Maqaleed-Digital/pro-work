# WORKCAPTAIN — RUNTIME INSTRUMENTATION WIRING PROTOCOL
#
# Status: ACTIVE CONTRACT

## 1. Purpose

This protocol governs runtime wiring targets for event emission.

## 2. Wiring Rule

Instrumentation changes may only be applied to governed target classes already established in the analytics track.

## 3. Required Target Families

Frontend:
- analytics abstraction module
- route/render trigger
- auth success trigger
- dashboard entry trigger

Platform:
- domain event publisher
- trust/evidence completion trigger

## 4. Verification Rule

Wiring is not considered successful until raw event rows are observable in the warehouse.
