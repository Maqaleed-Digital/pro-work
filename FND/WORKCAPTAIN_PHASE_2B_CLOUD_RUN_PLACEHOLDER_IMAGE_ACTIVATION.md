# WORKCAPTAIN — PHASE 2B CLOUD RUN PLACEHOLDER IMAGE ACTIVATION

Version: 1.0
Status: ACTIVE
Applies To: Source-of-truth commit 7185d0a1362207ee0ef3e02338a7342d5957aaa4

---

## 1. Purpose

This phase completes nonprod activation by pushing placeholder container images
to Artifact Registry and deploying all four Cloud Run services.

Placeholder images verify:
- Cloud Run deployment path
- Service account → registry pull access
- VPC connector networking
- Runtime wiring (env vars, secrets)
- Endpoint reachability on *.run.app

This phase does not deploy real application code.

---

## 2. Placeholder Image Strategy

A minimal Go HTTP server (scratch-based) is used as the placeholder.
It serves a health check on GET / and GET /health returning 200.
Image is built locally and pushed to Artifact Registry under each service tag.

Services:
- api-service
- trust-processor
- agent-orchestrator
- background-worker

---

## 3. Hard Rules

1. Nonprod project only.
2. Placeholder images only — no production code.
3. No production secrets injected.
4. Cloud Run services deploy with min_instances=0 in nonprod.
5. Evidence must be captured.
6. Commit and push after successful activation.

---

## 4. Exit Criteria

- All four images pushed to me-central2-docker.pkg.dev
- All four Cloud Run services deployed
- terraform apply succeeds
- At least one service URL is reachable (HTTP 200)
- Evidence captured
- Commit pushed

---

## 5. Next Step

WORKCAPTAIN-PHASE-3-RUNTIME-HARDENING-AND-ACCESS-CONTROL
