# OPERATIONAL SYSTEM OBJECT MODEL

## Purpose

This document defines the governed system objects that the execution interface must expose and operate upon.

## Object Principle

Objects are not arbitrary records.
They are governed operational entities whose lifecycle must remain traceable and institution-compatible.

## Core Operational Objects

The interface must formalize at minimum the following objects:

1. Entity
2. Opportunity
3. Deal
4. Intake record
5. Allocation decision
6. Scenario state
7. Reserve action
8. Escalation record
9. Intervention record
10. Assurance pack
11. Certification state
12. Accountability case
13. Remediation cycle
14. Portfolio command state

## Object Requirements

Each governed object must define:

- object purpose
- owner role
- state model
- upstream dependency set
- allowed transitions
- escalation hooks
- invalidity hooks
- evidence linkage

## Object Rule

No object may move state without traceable compatibility with the institutional control stack.

## Outcome

The operational object model converts doctrine into concrete system objects suitable for product implementation.
