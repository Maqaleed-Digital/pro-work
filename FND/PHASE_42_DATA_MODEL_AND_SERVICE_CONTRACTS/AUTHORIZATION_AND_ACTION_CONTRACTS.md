# AUTHORIZATION AND ACTION CONTRACTS

## Purpose

This document defines authorization and action contracts for governed product behavior.

## Authorization Principle

Authorization is not only access permission.
It is action legitimacy under institutional doctrine.

A user, actor, or service may see an object without being allowed to transition it.

## Required Authorization Layers

The action model must enforce:

1. role-based visibility authorization
2. role-based action authorization
3. entity-scoped authority
4. board / executive / operator authority separation
5. classification-safe disclosure authorization
6. escalation-gated action authorization
7. certification-sensitive action authorization

## Contract Outputs

Every action contract must define:

- actor types permitted
- actor scope required
- object states allowed
- object states blocked
- escalation prerequisites
- invalidity blockers
- evidence prerequisites
- audit record requirement

## Authorization Rule

No action may be authorized solely because the actor is authenticated; it must also be institutionally legitimate.

## Outcome

These contracts become the enforcement logic for UI actions, API handlers, and backend transitions.
