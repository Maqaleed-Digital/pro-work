# CORE INTERACTION AND STATE FLOW MODEL

## Purpose

This document defines the primary interaction flows and state transitions that operationalize the WorkCaptain / ProWork system.

## Flow Principle

Every interaction flow must begin from governed entry and progress through governed state changes only.

Flows must remain compatible with:

- qualified intake
- portfolio command
- allocation logic
- escalation logic
- accountability logic
- certification logic

## Core Flows

### Flow 1 — External entry to governed intake
Source enters through a structured interface and is classified, bounded, and routed.

### Flow 2 — Intake to opportunity / deal state
Qualified records become governed pipeline objects only after valid classification and routing.

### Flow 3 — Deal to portfolio command
Active deal state affects command, allocation, intervention, and synchronization views.

### Flow 4 — Allocation to intervention / escalation
Allocation states may trigger capital prioritization, intervention, or escalation.

### Flow 5 — Scenario / reserve to resilience action
Scenario changes may trigger reserve review, contingency response, or command reprioritization.

### Flow 6 — Accountability breach to remediation
Performance or doctrine breaches create accountability cases and remediation cycles.

### Flow 7 — Assurance to certification
Assurance and readiness surfaces feed bounded certification and closure states.

## Flow Outputs

Each flow must define:

- starting state
- allowed transitions
- actor roles
- escalation hooks
- invalidity hooks
- completion criteria

## Flow Rule

No user-visible flow may conceal a required governed state transition.

## Outcome

The state flow model makes the institutional system operable as a coherent application.
