# WORKCAPTAIN / PROWORK — PHASE 60
## Live Deployment Verification + Go-Live Certification

Status: ACTIVE
Source-of-truth input commit: 3887cf25392b1a0fab86a7d8918523e98954162a
Execution model: Option C (Hybrid, integration-enforced)

## Purpose
Phase 60 performs live deployment verification against the configured production base URL and upgrades production status to LIVE_VERIFIED only when objective checks pass.

This phase introduces:
- live verification contract
- go-live certification contract
- production verification routes in mounted runtime
- verification evidence generation
- go-live certification state persistence
- live verification and rollback runbooks

## Verification target
- WC_PROD_BASE_URL
- health route
- production status route
- secure external route with valid API key

## Routes active after this phase
- GET /api/production/status
- GET /api/production/config-check
- GET /api/production/deployment-summary
- GET /api/production/live-verification
- GET /api/production/go-live-certification

## Mandatory runtime rules
- no live verification may pass without successful external checks
- no go-live certification may be issued without live verification
- runtime must remain fail-closed on missing production variables
- production status may become LIVE_VERIFIED only from persisted verification state
- failed verification must set deployment status to DEPLOYMENT_FAILED

## Acceptance criteria
- live verification contract exists
- go-live certification contract exists
- deployment verification script validates required live variables
- live verification evidence is deterministic
- mounted runtime serves live verification routes
- runtime reports LIVE_VERIFIED only after successful verification
