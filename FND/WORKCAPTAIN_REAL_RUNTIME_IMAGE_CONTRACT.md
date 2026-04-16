# WORKCAPTAIN — REAL RUNTIME IMAGE CONTRACT

Version: 1.0  
Status: ACTIVE

## 1. Purpose

This contract governs approved image references for Phase 6 real runtime cutover.

## 2. Required Services

- `api-service`
- `trust-processor`
- `agent-orchestrator`
- `background-worker`

## 3. Allowed Image Reference Types

Allowed:
- immutable version tags
- image digests

Examples:
- `me-central2-docker.pkg.dev/project/repo/api:v20260408-001`
- `me-central2-docker.pkg.dev/project/repo/api@sha256:abcdef...`

Forbidden:
- `:latest`
- unpinned floating tags
- missing registry path
- local-only image names

## 4. Deployment Contract

Each service must be deployed with exactly one declared image URI supplied at execution time through environment variables:

- `API_IMAGE_URI`
- `TRUST_IMAGE_URI`
- `AGENT_IMAGE_URI`
- `WORKER_IMAGE_URI`

## 5. Verification Contract

Completion evidence must record:
- requested image URI
- deployed revision name
- service URL
- service status snapshot

## 6. Rollback Contract

Rollback must be possible using the captured previous revision or previous image reference where available.
