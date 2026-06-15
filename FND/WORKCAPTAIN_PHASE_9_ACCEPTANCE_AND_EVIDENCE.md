# WORKCAPTAIN — PHASE 9 ACCEPTANCE AND EVIDENCE

Version: 1.0  
Status: ACTIVE

## 1. Required Evidence

Evidence pack must include:

- public health check result
- unauthenticated admin check result
- unauthenticated identity check result
- authenticated admin check result
- authenticated identity check result
- manifest with timestamp and source-of-truth commit

## 2. Required Inputs For Gate Execution

The gate script requires explicit inputs:

- public base URL
- health path
- admin path
- identity path
- authenticated header value for admin validation
- authenticated header value for identity validation

## 3. Failure Rule

This phase is not complete if:

- protected routes are reachable without auth
- authenticated validation is not demonstrated
- health route is broken
- evidence is incomplete
