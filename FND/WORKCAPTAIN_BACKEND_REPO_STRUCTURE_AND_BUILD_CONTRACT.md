# WORKCAPTAIN — BACKEND REPO STRUCTURE AND BUILD CONTRACT

Version: 1.0  
Status: ACTIVE

## 1. Target Structure

Required directories:

- `services/api-service/`
- `services/trust-processor/`
- `services/agent-orchestrator/`
- `services/background-worker/`

Each service directory must include:

- `Dockerfile`
- source entrypoint
- dependency manifest appropriate to chosen stack
- minimal README or service note optional but recommended

## 2. Build Contract

Each service must be buildable into a distinct image target:

- `api-service`
- `trust-processor`
- `agent-orchestrator`
- `background-worker`

Expected registry target pattern for later Phase 6 prep:

- `me-central2-docker.pkg.dev/prj-maq-workcaptain-nonprod/workcaptain/api-service:<tag>`
- `me-central2-docker.pkg.dev/prj-maq-workcaptain-nonprod/workcaptain/trust-processor:<tag>`
- `me-central2-docker.pkg.dev/prj-maq-workcaptain-nonprod/workcaptain/agent-orchestrator:<tag>`
- `me-central2-docker.pkg.dev/prj-maq-workcaptain-nonprod/workcaptain/background-worker:<tag>`

## 3. Evidence of Readiness

Readiness evidence must prove:
- directories exist
- Dockerfiles exist
- source files exist
- build commands can be formed truthfully
- services are no longer placeholder-only infrastructure
