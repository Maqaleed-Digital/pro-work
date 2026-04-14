# WORKCAPTAIN — RUNTIME EVENT EMISSION PROTOCOL
#
# Status: ACTIVE CONTRACT

## 1. Purpose

This protocol governs emission of real runtime events into WorkCaptain analytics raw tables.

## 2. Required Raw Destinations

- raw_frontend_events
- raw_platform_events

## 3. Required Runtime Target Families

Frontend:
- analytics abstraction module
- route render event
- auth success event
- dashboard entry event

Platform:
- project lifecycle event publisher
- milestone completion publisher
- trust/evidence completion publisher

## 4. Truth Rule

Only real runtime-originated rows count toward PASS.
