# WORKCAPTAIN — PHASE 5 SEMI-PUBLIC BETA LAUNCH

Version: 1.0  
Status: ACTIVE  
Phase: 5  
Applies From Commit Baseline: 93d7919e955c45cfc89e0f6b10a024f0c4f218f9  
Primary Domain: api.workcaptain.ai

## 1. Purpose

This phase upgrades WorkCaptain from pre-cutover internal alpha into a governed semi-public beta entry posture.  
The objective is to introduce a controlled public HTTPS ingress plane, edge protection, observability baseline, and rollback-safe operating model without widening backend exposure beyond approved public-safe routes.

## 2. Target Outcome

At phase completion:

- `api.workcaptain.ai` resolves to a Google Cloud HTTPS Load Balancer.
- Managed SSL is active for `api.workcaptain.ai`.
- Cloud Armor protects ingress with baseline rate limiting and request filtering.
- Backend Cloud Run services remain governed and reachable only through the approved ingress path.
- Direct service URLs are no longer the promoted public entry point.
- Baseline dashboards, alerts, and validation evidence exist.
- Rollback can detach or disable public exposure quickly.

## 3. Baseline State Entering Phase 5

Confirmed baseline from prior source of truth:

- Repository: `Maqaleed-Digital/pro-work`
- Branch: `workcaptain-gcp-architecture`
- Source-of-truth commit: `93d7919e955c45cfc89e0f6b10a024f0c4f218f9`
- Current environment: `prj-maq-workcaptain-nonprod`
- Region: `me-central2`
- Runtime posture: fully live nonprod multi-service platform with direct `.run.app` service URLs
- Phase 4 status: real runtime cutover prepared, not executed

## 4. In Scope

- Domain target lock for `api.workcaptain.ai`
- Global external HTTPS load balancer
- Serverless NEG attachment to approved public backend
- Managed certificate
- URL map and routing baseline
- Cloud Armor policy with baseline protections
- Public exposure boundary documentation
- Observability baseline for edge and backend
- Beta rollout and rollback runbook
- Evidence-first execution script

## 5. Out of Scope

- Full production launch
- Broad anonymous write access to sensitive routes
- Admin console exposure
- Internal-only APIs exposed publicly
- Database direct exposure
- DNS provider migration beyond required A/AAAA or alias configuration
- Application business logic refactor
- Replacing Phase 4 real image cutover scope

## 6. Public Exposure Policy

Approved public hostname:

- `api.workcaptain.ai`

Approved exposure model:

- Semi-public beta
- Public HTTPS ingress permitted
- Cloud Armor mandatory
- Only public-safe routes may be published
- Admin, debug, internal, and privileged control routes remain blocked or unadvertised

## 7. Public-Safe Routing Contract

Allowed initial public route posture:

- `/`
- `/health`
- `/ready`
- `/docs` only if intentionally permitted for beta visibility
- `/openapi.json` only if intentionally permitted for beta visibility
- application API routes explicitly approved by product and security review

Forbidden public route posture:

- `/admin`
- `/internal`
- `/debug`
- `/metrics` unless separately protected
- any route intended for operator-only workflows
- any route exposing secrets, raw jobs, system internals, or privileged controls

## 8. Edge Architecture

Target ingress path:

User  
→ `api.workcaptain.ai`  
→ Global HTTPS Load Balancer  
→ Cloud Armor policy  
→ URL Map  
→ Backend Service  
→ Serverless NEG  
→ Cloud Run approved public backend

## 9. Mandatory Security Controls

- Managed certificate only
- TLS termination at load balancer
- Cloud Armor attached to public backend service
- Rate limiting baseline enabled
- Log visibility enabled for ingress
- No promotion of direct `.run.app` URLs as public endpoints
- Public-safe route review documented
- Rollback path defined before public verification begins

## 10. Observability Minimum

Minimum required evidence for completion:

- successful DNS resolution check
- certificate provisioning status
- load balancer forwarding rule confirmation
- Cloud Armor policy attachment confirmation
- HTTP 200 or expected controlled response from approved public endpoint
- negative test against blocked or forbidden route
- logs showing ingress requests
- alert policies or equivalent baseline definitions recorded
- evidence manifest with command outputs

## 11. Completion Gate

Phase 5 is complete only when:

1. `api.workcaptain.ai` is the validated public entry point
2. HTTPS is active
3. Cloud Armor is attached
4. approved route tests pass
5. forbidden route tests fail closed or remain unavailable
6. evidence pack is generated
7. rollback instructions are validated
