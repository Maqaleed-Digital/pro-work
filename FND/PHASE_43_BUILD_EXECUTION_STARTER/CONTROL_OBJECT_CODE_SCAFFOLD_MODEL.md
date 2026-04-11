# CONTROL OBJECT CODE SCAFFOLD MODEL

## Purpose

This document defines how governed control objects should first appear in code scaffold form.

## Control Object Principle

Control objects are not plain interfaces.
They are implementation placeholders for governed runtime entities with identity, state, invalidity, evidence linkage, and authority constraints.

## Starter Control Objects

The scaffold must define starter types for:

- Entity
- IntakeRecord
- Opportunity
- Deal
- AllocationDecision
- ScenarioState
- ReserveAction
- EscalationRecord
- InterventionRecord
- AssurancePack
- CertificationState
- AccountabilityCase
- RemediationCycle
- PortfolioCommandState

## Starter Requirements

Each starter object definition must include:

- id
- type
- status
- owner scope
- evidence reference slots
- invalidity flags
- escalation flags
- timestamps

## Rule

No scaffold object may omit status, authority relevance, or invalidity structure.

## Outcome

The control object scaffold creates the first code-level representation of governed institutional objects.
