# WORKCAPTAIN — PHASE 3 RUNTIME HARDENING AND ACCESS CONTROL

Version: 1.0
Status: ACTIVE
Applies To: Source-of-truth commit 71ded79908a6ae0c5dc57980c4043ada4f928b6f

---

## 1. Purpose

This phase hardens the live nonprod WorkCaptain runtime on Google Cloud.

Phase 2 established the first live nonprod runtime and verified service availability on *.run.app endpoints.
Phase 3 adds the first controlled access and security posture needed before wider internal use.

---

## 2. Scope

This phase includes:

1. Cloud Run ingress tightening
2. removal of unauthenticated public access where appropriate
3. Cloud Armor security policy baseline
4. HTTPS load balancer scaffolding for serverless backends
5. managed certificate / custom domain readiness placeholders
6. Secret Manager contract and runtime secret provisioning scaffolding
7. IAM review and hardening evidence
8. observability dashboard and alerting scaffolding
9. post-hardening verification evidence

This phase does not include:
- production deployment
- final public domain cutover
- real application container replacement
- WAF rule tuning beyond baseline
- full SRE operating model

---

## 3. Hard Rules

1. Nonprod project only
2. Primary region remains me-central2
3. *.run.app endpoints are not the long-term ingress model
4. Public unauthenticated exposure must be reduced where possible
5. Secrets must not be committed to repo
6. Evidence is mandatory
7. Pushed commit hash is the only source of truth

---

## 4. Target Outcomes

After this phase:
- load balancer baseline exists
- Cloud Armor baseline exists
- serverless NEG structure exists
- unauthenticated access is removed from non-essential services
- secret contracts are ready
- observability scaffolding exists
- hardening evidence is captured

---

## 5. Exit Criteria

This phase is complete only if:
- Terraform hardening artifacts exist
- hardening script executes
- IAM/access posture evidence is captured
- Cloud Armor baseline is provisioned or planned
- serverless ingress scaffolding is provisioned or planned
- commit is pushed

---

## 6. Next Step

After this phase:
WORKCAPTAIN-PHASE-4-REAL-RUNTIME-CUTOVER-AND-INTERNAL-ALPHA
