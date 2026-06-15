# WORKCAPTAIN — PHASE 2 GCP NONPROD ACTIVATION

Version: 1.0  
Status: ACTIVE  
Applies To: Source-of-truth commit f3456ebb212e8bcb36c465ae697e58c9cb605006

---

## 1. Purpose

This phase bootstraps and activates the first real nonproduction Google Cloud runtime for WorkCaptain.

It converts the previously validated infrastructure baseline into live nonprod resources by:

- refreshing prerequisite auth posture
- bootstrapping Terraform remote state
- preparing nonprod backend config
- creating Artifact Registry if missing
- running Terraform init / validate / plan / apply
- collecting deployment evidence
- verifying deployed resources

This phase is nonprod-only.

---

## 2. Inputs

Required:
- WC_GCP_PROJECT_ID
- WC_GCP_REGION
- WC_GCP_ENV
- WC_GCP_DB_TIER

Defaults expected:
- WC_GCP_PROJECT_ID=prj-maq-workcaptain-nonprod
- WC_GCP_REGION=me-central2
- WC_GCP_ENV=dev
- WC_GCP_DB_TIER=db-custom-1-3840

Remote state bucket:
- workcaptain-tfstate

Artifact Registry repo:
- workcaptain

---

## 3. Scope

This phase includes:

1. ADC refresh prerequisite check
2. remote state bucket bootstrap
3. Artifact Registry bootstrap
4. backend config generation
5. Terraform init
6. Terraform validate
7. Terraform plan
8. Terraform apply
9. output capture
10. Cloud Run/service verification
11. evidence generation

---

## 4. Hard Rules

1. Nonprod project only.
2. No prod or staging project in this pack.
3. No production secrets in repository.
4. Bucket bootstrap must happen before backend-backed init.
5. All changes must produce evidence.
6. Any failed terraform/apply/verify step blocks completion.
7. Final pushed commit hash is the only source of truth.

---

## 5. Expected Live Outcomes

After success, the nonprod environment should have:
- Terraform remote state bucket
- Artifact Registry repository
- deployed GCP resources from infrastructure/gcp
- Terraform outputs captured
- verification evidence for review

---

## 6. Exit Criteria

This phase is complete only if:
- ADC is valid
- state bucket exists
- Artifact Registry exists
- terraform init succeeds against remote backend
- terraform validate succeeds
- terraform plan succeeds
- terraform apply succeeds
- verification evidence is present
- commit is pushed

---

## 7. Explicit Out-of-Scope for This Phase

The following are intentionally deferred:

- Global external Application Load Balancer — deferred to Phase 3
- Serverless NEG configuration — deferred to Phase 3
- Custom domain and managed TLS certificate — deferred to Phase 3
- Cloud Armor — deferred to Phase 3
- CDN — deferred to Phase 3

Services are accessible via Cloud Run default *.run.app endpoints only during this phase.

---

## 8. Next Step

If this phase succeeds, proceed to:

WORKCAPTAIN-PHASE-3-RUNTIME-HARDENING-AND-ACCESS-CONTROL

That phase should cover:
- Global external Application Load Balancer with serverless NEG
- Custom domain, managed TLS certificate
- IAM hardening
- Secret rotation posture
- Service exposure policy
- Auth-gated verification paths
- Observability dashboards
- Cloud Armor ingress policy
