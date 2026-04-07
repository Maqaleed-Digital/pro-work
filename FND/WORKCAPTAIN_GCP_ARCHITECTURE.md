# WORKCAPTAIN — GCP ARCHITECTURE BASELINE

Version: 1.0  
Status: ACTIVE  
Applies From: Sprint S25+  
Supersedes: AWS deployment direction for platform runtime

---

## 1. Purpose

This document establishes Google Cloud as the canonical infrastructure target for WorkCaptain.

WorkCaptain is the AI-native work orchestration infrastructure platform formerly referenced as ProWork. The platform retains its deterministic Trust Engine, evidence-first operations, human-in-the-loop governance, and bounded AI execution model while shifting the production runtime from AWS-oriented planning to Google Cloud architecture.

This baseline also incorporates the multi-agent AI operating model as an advisory and orchestrated layer, not as a replacement for trust, approvals, or governance.

---

## 2. Strategic Architecture Position

WorkCaptain remains a layered platform:

1. Workforce OS  
2. Execution Engine  
3. Trust Engine  
4. Multi-Agent AI Layer  
5. Work Identity Network

Architectural rule:

- Trust Engine remains deterministic.
- AI remains advisory, explainable, and fully logged.
- No AI agent may approve contracts, release money, finalize compliance, or bypass human approval.
- All important state transitions must emit governed events.
- Evidence packs remain mandatory for critical workflows.

---

## 3. Google Cloud as Canonical Target

Google Cloud is now the default deployment target for WorkCaptain.

### 3.1 Primary reasons

- Better alignment with existing Maqaleed portfolio cloud direction
- Native fit for AI orchestration through Vertex AI
- Strong support for managed runtime, eventing, secrets, logging, and storage
- KSA and GCC deployment alignment through regional design
- Lower operational complexity for early production compared with Kubernetes-first deployment

### 3.2 Default platform posture

- Runtime: Cloud Run
- Database: Cloud SQL for PostgreSQL
- Cache / queue assist: Memorystore for Redis
- Object storage: Cloud Storage
- Events: Pub/Sub
- Secrets: Secret Manager
- Logs / metrics / traces: Cloud Logging + Cloud Monitoring
- AI model access: Vertex AI
- Identity / access boundary: IAM + service accounts + app RBAC
- Edge / TLS: Global HTTPS Load Balancer + managed certificates
- CDN / static acceleration: optional Cloud CDN for public assets

---

## 4. Canonical GCP Topology

```text
Users / Admins / Employers / Workers
                ↓
      Global HTTPS Load Balancer
                ↓
           Cloud Run Services
    ---------------------------------
    | api-service                  |
    | admin-console                |
    | trust-processor              |
    | agent-orchestrator           |
    | background-worker            |
    ---------------------------------
          ↓       ↓       ↓
   Cloud SQL   Memorystore   Pub/Sub
          ↓       ↓       ↓
        Trust / App Data    Event Backbone
                ↓
          Cloud Storage
      (evidence packs, exports)
                ↓
            Vertex AI
   (planner / executor / auditor agents)

Secret Manager → Cloud Run (at startup)
Logging: all services → Cloud Logging → Monitoring alerts
```

---

## 5. Cloud Run Service Catalogue

| Service | Responsibility |
|---|---|
| api-service | External REST/gRPC API, authentication, routing |
| admin-console | Internal admin operations UI backend |
| trust-processor | Deterministic trust scoring, contract, compliance logic |
| agent-orchestrator | Spawn, monitor, pause, and record AI agent tasks |
| background-worker | Async job processing via Pub/Sub subscription |

---

## 6. Data Tier

### 6.1 Cloud SQL for PostgreSQL

- Primary datastore for platform.
- Hosted in same region as Cloud Run services.
- Private IP only, accessed via Cloud SQL Auth Proxy.
- Automated backups enabled (daily), point-in-time recovery enabled.
- Read replicas for reporting workloads when required.

### 6.2 Redis — Memorystore for Redis

- Session management and token cache.
- Rate-limiting buckets.
- Short-term job state for agent orchestrator.

### 6.3 Cloud Storage

- Evidence pack archives.
- Contract documents and attachments.
- Signed URLs for direct client downloads.
- All buckets: uniform access control, no public access.

---

## 7. Event Backbone

All platform services emit and consume events over Pub/Sub.

### Core topics (initial)

| Topic | Producers | Consumers |
|---|---|---|
| trust-events | trust-processor | audit-logger, admin-console |
| contract-events | api-service, trust-processor | background-worker |
| agent-task-events | agent-orchestrator | background-worker, audit-logger |
| compliance-events | trust-processor | audit-logger, admin-console |

---

## 8. AI Layer — Multi-Agent Architecture on Vertex AI

### 8.1 Agent types (initial catalogue)

| Agent | Role |
|---|---|
| Planner Agent | Decompose requests into bounded tasks |
| Executor Agent | Execute bounded task with full logging |
| Auditor Agent | Review outputs, flag anomalies, generate audit entries |
| Approval Agent | Generate recommendations for human approval queues |
| Compliance Agent | Check outputs against rules, policies, and evidence requirements |

### 8.2 Execution model

- Agents run inside agent-orchestrator service.
- Every agent call is logged: inputs, outputs, model, latency, tokens, decision.
- Agent outputs are advisory unless explicitly granted elevated status by human approval.
- Approval Agent never approves — it recommends.
- Agents may not write to Trust Engine records directly.

### 8.3 Vertex AI integration

- Models accessed through Vertex AI API (Gemini Pro, Gemini Flash as defaults).
- No direct OpenAI, Anthropic, or Bedrock calls in production.
- All model endpoints configurable via Secret Manager at runtime.

---

## 9. IAM and Security Posture

- All Cloud Run services run as dedicated service accounts.
- Service accounts follow least-privilege principle.
- No user-managed keys — Workload Identity Federation where applicable.
- All network paths are private or TLS-terminated.
- Customer data encrypted at rest and in transit.
- CMEK optional for regulated deployment tiers.

---

## 10. Observability

| Layer | Tooling |
|---|---|
| Structured logs | Cloud Logging, all services log JSON |
| Metrics | Cloud Monitoring, Cloud Run built-in metrics |
| Distributed traces | Cloud Trace (auto-instrumented where possible) |
| Alerts | Cloud Monitoring alert policies → PagerDuty / email |
| Error tracking | Cloud Error Reporting |
| Dashboards | Cloud Monitoring custom dashboards |

---

## 11. Deployment and CI/CD Posture

- Source: GitHub (main protected branch)
- Container builds: Cloud Build on push or PR merge to main
- Image registry: Artifact Registry
- Deployment: Cloud Build triggers → Cloud Run service update
- Environments: dev → staging → production (separate GCP projects or namespaces)
- Migrations: run as Cloud Run Jobs before service update in staging and production

---

## 12. Regional Strategy

| Region | Purpose |
|---|---|
| me-central1 (Doha) | KSA / GCC production (primary) |
| europe-west1 (Belgium) | EU-based customers / DR |

Regional selection follows data residency requirements and customer SLA obligations.

---

## 13. NOT in scope for this baseline

- Multi-cloud or AWS fallback (archived for now)
- On-premise deployment
- Kubernetes-based runtime (deferred unless load requires it)
- Direct user-managed database hosting

---

## 14. Open Decisions

| Item | Owner | Status |
|---|---|---|
| Confirm KSA region availability for Cloud SQL | Waheeb | Open |
| Finalize deployment environment count (2 vs 3) | Waheeb | Open |
| Define CMEK requirement for regulated tier | Waheeb | Open |

---

*Document owner: Waheeb*  
*Initial baseline — WorkCaptain Sprint S25+*
