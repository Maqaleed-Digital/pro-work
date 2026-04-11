# INTERFACE GOVERNANCE AND INVALIDITY RULES

## Purpose

This document defines how the interface enforces governance and how invalid states must be handled.

## Governance Principle

The interface must not merely display governance.
It must actively respect and enforce it.

## Mandatory Interface Controls

The interface must enforce:

1. role-bounded visibility
2. action-bounded authority
3. invalidity-aware state display
4. escalation-aware routing
5. classification-safe disclosure behavior
6. doctrine-compatible transitions
7. fail-closed treatment of unresolved critical states

## Invalidity States

The interface must treat the following as invalidating conditions:

- broken evidence dependency
- broken governance dependency
- broken doctrine dependency
- unresolved escalation blocking action
- authority mismatch for requested action
- incomplete classification for bounded flows
- unresolved certification contradiction

## Interface Outputs

Each governed interface state must define:

- valid / blocked / escalated status
- reason for state
- required next governed action
- allowed actor scope
- recovery path if available

## Rule

No interface may let a user execute a materially invalid action merely because the UI surface exists.

## Outcome

These rules ensure the UI becomes a governed runtime surface rather than a decorative layer.
