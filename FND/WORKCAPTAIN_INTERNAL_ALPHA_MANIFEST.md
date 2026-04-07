# WORKCAPTAIN INTERNAL ALPHA MANIFEST

Status: ACTIVE

Environment:
- project: prj-maq-workcaptain-nonprod
- region: me-central2
- env: dev

Services in alpha:
- api-service
- trust-processor
- agent-orchestrator
- background-worker

Required real runtime image inputs:
- API_IMAGE_URI
- TRUST_IMAGE_URI
- AGENT_IMAGE_URI
- WORKER_IMAGE_URI

Rules:
- image tags must be explicit and immutable-preferred
- latest tags are not permitted for real cutover
- secret values must already exist in Secret Manager
- rollback target revisions must be captured before deploy
