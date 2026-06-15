# WORKCAPTAIN — PHASE 9 AUTH + IDENTITY CONTROL LAYER

Version: 1.0  
Status: ACTIVE  
Applies From Commit Baseline: 8cf491f43715342f57cafa7ad1ee8c4b0cafd4b7

## 1. Purpose

This phase introduces the first authenticated control layer for the live WorkCaptain system.

The objective is to move from:
- controlled public exposure
to
- authenticated and role-aware operator/admin access

## 2. Entering Baseline

Confirmed entering state:

- public edge active at `api.workcaptain.ai`
- Cloud Armor active
- real runtime active across four Cloud Run services
- `/admin` is no longer publicly accessible
- uptime monitoring and alerting baseline are active
- platform is operating as a monitored live system

## 3. Objective

Establish a truthful baseline auth + identity layer through:

- authenticated access control for protected routes
- identity resolution for authenticated users or operators
- token/session baseline documentation
- route protection contract
- evidence-based verification for both unauthenticated and authenticated access

## 4. In Scope

- auth + identity control contract
- protected route baseline
- admin/operator route protection requirement
- identity endpoint baseline
- token/session baseline documentation
- acceptance/evidence gate
- operational handoff note

## 5. Out of Scope

- full enterprise SSO integration
- external IdP selection beyond what implementation later chooses
- advanced RBAC matrix beyond baseline operator/admin control
- frontend login UX design
- business feature expansion
- infrastructure redesign
- observability redesign

## 6. Minimum Required Outcomes

At this phase completion, WorkCaptain must have:

- a protected admin route that returns `401` or `403` without valid auth
- an authenticated identity endpoint or equivalent caller-identity endpoint
- a documented token/session baseline
- at least one valid authenticated verification path recorded in evidence
- unauthenticated verification recorded in evidence

## 7. Route Classes

### Public
Allowed public route examples:
- `/health`

### Protected
Must require auth:
- `/admin`
- identity endpoint such as `/auth/identity` or equivalent implementation path
- any operator/admin control path

## 8. Completion Gate

Phase 9 is complete only when:

1. `/health` remains `200`
2. protected admin path returns `401` or `403` without auth
3. identity path returns `401` or `403` without auth
4. admin path returns success with valid authenticated credential
5. identity path returns success with valid authenticated credential
6. evidence records both unauthenticated and authenticated checks
7. handoff note is recorded
