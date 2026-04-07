# WORKCAPTAIN — PHASE 1 GCP FOUNDATION VALIDATION (DEV ONLY)

Version: 1.0  
Status: ACTIVE  
Applies To: Source-of-truth commit bb491de67a395d263385e66b1875bfa59094e5d8

---

## 1. Purpose

This document defines the first executable validation layer for the WorkCaptain Google Cloud foundation.

It is limited to a development GCP project and validates that the newly introduced GCP infrastructure baseline can be initialized, formatted, validated, and planned successfully without touching staging or production.

This phase does not authorize:
- production deployment
- staging deployment
- destructive replacement
- AI runtime activation in production
- governance bypass

---

## 2. Validation Scope

This pack validates:

1. Terraform file integrity
2. Terraform initialization
3. Terraform formatting
4. Terraform validation
5. Terraform plan against dev-only variables
6. Required variable contract
7. Optional deploy helper syntax review
8. Evidence generation for the validation run

---

## 3. Required Dev Inputs

The following must be provided explicitly for the validation run:

- WC_GCP_PROJECT_ID
- WC_GCP_REGION
- WC_GCP_ENV
- WC_GCP_DB_TIER

Expected defaults for this phase:
- WC_GCP_ENV=dev
- WC_GCP_REGION=me-central2

---

## 4. Hard Rules

1. Dev project only.
2. No apply in this phase.
3. No staging or prod variables.
4. No production secrets in files.
5. No mutation outside the declared dev project.
6. Validation evidence must be captured.
7. Terraform plan output must be stored for review.
8. Any failure blocks progression.

---

## 5. Expected Terraform Commands

The canonical validation sequence is:

1. terraform fmt -check -recursive
2. terraform init
3. terraform validate
4. terraform plan -var-file=env/dev/dev.tfvars

No apply is permitted in this pack.

---

## 6. Evidence Requirements

This phase must produce:

- git_head.txt
- branch.txt
- terraform_version.txt
- gcloud_version.txt
- env_contract.txt
- fmt.txt
- init.txt
- validate.txt
- plan.txt
- manifest.txt

Optional:
- deploy_script_head.txt
- outputs_preview.txt

---

## 7. Exit Criteria

This phase is complete only if:

- required variables are present
- terraform init succeeds
- terraform validate succeeds
- terraform plan succeeds against dev-only tfvars
- evidence files are present
- repo changes are committed and pushed

---

## 8. Next Step After Success

If this pack passes, the next pack is:

WORKCAPTAIN-PHASE-2-GCP-NONPROD-ACTIVATION

That phase should cover:
- target dev project bootstrap
- Artifact Registry confirmation
- Secret Manager baseline
- Cloud Run runtime contract
- nonprod-safe deploy path
- post-deploy verification
