# WORKCAPTAIN — PHASE 6 REAL RUNTIME CUTOVER

Version: 1.0  
Status: ACTIVE  
Phase: 6  
Applies From Commit Baseline: 50d2ebb28fe11877814f0044d69d6e8cd1ee151f

## 1. Purpose

This phase replaces placeholder runtime images with approved immutable real runtime images for all four WorkCaptain services while preserving the live Phase 5 public ingress posture on `api.workcaptain.ai`.

## 2. Entering Baseline

Confirmed preconditions entering Phase 6:

- Repository baseline: `50d2ebb28fe11877814f0044d69d6e8cd1ee151f`
- Branch: `workcaptain-gcp-architecture`
- Phase 5 complete:
  - public DNS active
  - HTTPS certificate active
  - load balancer active
  - Cloud Armor active
  - `api.workcaptain.ai/health` returning success
- Existing cutover concept already established in prior phase work
- Remaining boundary from Phase 5:
  - placeholder runtime still handles broad routes
  - `/admin` remained reachable via placeholder behavior
  - route-level boundary enforcement carries forward into real runtime validation

## 3. Target Outcome

At Phase 6 completion:

- `api-service` runs approved immutable real image
- `trust-processor` runs approved immutable real image
- `agent-orchestrator` runs approved immutable real image
- `background-worker` runs approved immutable real image
- all four services are updated with pinned image references only
- public edge remains intact and healthy
- verification confirms runtime revision updates and endpoint health
- rollback path is documented and ready
- evidence pack captures before/after revisions, images, and tests

## 4. In Scope

- image URI contract lock
- pre-cutover capture of existing revisions and images
- real image deployment to all four Cloud Run services
- post-deploy verification
- public API health verification through `api.workcaptain.ai`
- direct service verification where appropriate
- rollback contract and commands
- evidence-first execution

## 5. Out of Scope

- new feature development
- schema redesign
- new infrastructure classes
- application authorization redesign beyond verification notes
- production launch
- domain or load balancer redesign
- changing Cloud Armor policy logic

## 6. Mandatory Cutover Inputs

The following environment variables are required and must reference immutable image tags or digests:

- `API_IMAGE_URI`
- `TRUST_IMAGE_URI`
- `AGENT_IMAGE_URI`
- `WORKER_IMAGE_URI`

## 7. Hard Rules

- no `:latest`
- no blank or mutable image references
- all image URIs must be immutable and deployable
- public ingress must remain operational after cutover
- rollback commands must be available before declaring completion
- any verification failure blocks completion

## 8. Completion Gate

Phase 6 is complete only when:

1. all four services show new deployed revisions
2. all four services point to approved immutable image URIs
3. `https://api.workcaptain.ai/health` succeeds after cutover
4. direct Cloud Run service status checks pass
5. evidence pack includes before and after deployment state
6. rollback command set is recorded
7. carry-forward note is updated for any remaining application-layer route controls
