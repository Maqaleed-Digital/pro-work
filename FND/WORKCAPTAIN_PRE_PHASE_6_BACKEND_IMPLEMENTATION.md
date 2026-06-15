# WORKCAPTAIN — PRE-PHASE-6 BACKEND IMPLEMENTATION

Version: 1.0  
Status: ACTIVE  
Applies From Commit Baseline: ca9ee320a809ba9116d3a1903f6e809f553de85d

## 1. Purpose

This phase exists because discovery confirmed that the backend source trees required for Phase 6 real runtime cutover do not exist in the current repository.

This is an application implementation phase, not an infrastructure phase.

## 2. Why This Phase Exists

Phase 6 requires real service-specific runtime images for:

- `api-service`
- `trust-processor`
- `agent-orchestrator`
- `background-worker`

Discovery outcome entering this phase:

- no backend source trees exist in the repo
- no backend Dockerfiles exist for the four services
- only placeholder runtime exists for Cloud Run backend services
- frontend apps exist but do not satisfy backend runtime requirements

Therefore Phase 6 remains blocked until the backend services are implemented, containerized, built, and pushed with immutable image tags.

## 3. Objective

Create the backend service source trees, Dockerfiles, minimal runtime contracts, and build readiness needed so that distinct immutable service images can be produced and Phase 6 can execute truthfully.

## 4. In Scope

- repository structure for backend services
- implementation contract for the four backend services
- Dockerfiles for the four backend services
- minimal service runtime behavior definitions
- health endpoint contract
- build readiness gate
- evidence gate proving backend sources now exist
- handoff contract into Phase 6 image build and cutover

## 5. Out of Scope

- full feature-complete business logic
- production-grade authorization design
- frontend redesign
- load balancer redesign
- Cloud Armor redesign
- direct execution of Phase 6
- pretending placeholder equals real backend

## 6. Required Backend Services

The following service source trees must exist after this phase:

- `services/api-service/`
- `services/trust-processor/`
- `services/agent-orchestrator/`
- `services/background-worker/`

Each must contain:
- application source
- `Dockerfile`
- runtime manifest or dependency file appropriate to the language used
- a health endpoint implementation or equivalent runtime readiness behavior

## 7. Minimum Truthful Outcome

At phase completion, the repo must be capable of building four distinct service images, even if initial business logic is minimal.

Distinct means:
- different source trees
- different Dockerfiles or runtime wiring where applicable
- different image targets
- not a single placeholder image reused four times

## 8. Completion Gate

This phase is complete only when:

1. all four backend service directories exist
2. all four service Dockerfiles exist
3. each service has runnable source code
4. each service exposes health/readiness behavior required for cutover verification
5. build-readiness gate passes
6. evidence captures exact backend source presence and build artifacts
7. handoff to Phase 6 is recorded
