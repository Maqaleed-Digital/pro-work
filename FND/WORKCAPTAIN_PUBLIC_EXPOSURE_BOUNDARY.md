# WORKCAPTAIN — PUBLIC EXPOSURE BOUNDARY

Version: 1.0  
Status: ACTIVE

## 1. Principle

Phase 5 is a semi-public beta, not unrestricted production exposure.

## 2. Approved Public Surface

Approved public surface is limited to product-safe and observability-safe endpoints required for beta operation.

Possible initial routes:
- `/`
- `/health`
- `/ready`
- explicitly approved API routes

Optional and separately approved:
- `/docs`
- `/openapi.json`

## 3. Explicitly Forbidden Public Surface

The following must not be intentionally exposed:

- admin routes
- operator consoles
- debug routes
- internal service paths
- job control endpoints
- direct worker invocation endpoints
- raw metrics without protection
- any route returning secrets, configs, tokens, or system internals

## 4. Service Exposure Rules

The following services are not public targets unless separately re-governed:

- `trust-processor`
- `background-worker`
- non-public `agent-orchestrator` operations

Public ingress is intended for the designated API-facing service only.

## 5. Validation Requirement

Before declaring completion:
- at least one approved public route must return success
- at least one forbidden route must fail closed or be unavailable
- evidence must record both
