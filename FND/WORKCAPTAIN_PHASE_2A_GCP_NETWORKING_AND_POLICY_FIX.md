# WORKCAPTAIN — PHASE 2A GCP NETWORKING AND POLICY FIX

Version: 1.0
Status: ACTIVE
Applies To: Source-of-truth commit 253bbd15004104fbf4e4d9a91f7291a886e39b9e

---

## 1. Purpose

This phase corrects the first nonprod activation blockers discovered during WorkCaptain Phase 2.

Observed failures:
- Cloud SQL private IP creation failed because Service Networking / Private Service Access was not configured.
- Artifact Registry creation failed with already-exists because the repository was bootstrapped outside Terraform state.
- Secret Manager creation failed because the current path attempted a global secret under a location-restricted org policy.

This phase fixes those issues in both code and execution flow.

---

## 2. Scope

This phase includes:
1. Terraform networking correction for Private Service Access
2. explicit Cloud SQL dependency on service networking
3. regional Secret Manager resource migration
4. Artifact Registry state import path in activation script
5. improved activation evidence behavior on failure
6. rerun-ready nonprod activation flow

This phase does not include:
- load balancer
- custom domain
- Cloud Armor
- CDN
- public ingress hardening
- production deployment

---

## 3. Hard Rules

1. Nonprod project only
2. Primary region remains me-central2
3. Fallback region remains me-central1 by exception only
4. No global secret resources
5. No prod or staging scope
6. Any failed apply remains blocking
7. Pushed commit hash is the only source of truth

---

## 4. Technical Corrections

### 4.1 Private Service Access
Add Terraform-managed:
- servicenetworking API enablement
- reserved peering range
- service networking connection

### 4.2 Cloud SQL
Add explicit depends_on so Cloud SQL waits for Private Service Access readiness.

### 4.3 Secret Manager
Replace global secret resources with regional secret resources in var.region.

### 4.4 Artifact Registry
If the workcaptain repository already exists, import it into Terraform state before plan/apply.

### 4.5 Activation Evidence
Write a manifest even on failed activation runs so evidence remains complete.

---

## 5. Exit Criteria

This fix phase is complete only if:
- main.tf is patched
- activation script is patched
- syntax checks pass
- changes are committed and pushed
- the repo is ready for Phase 2 activation rerun

---

## 6. Next Step

After this pack is pushed, rerun:

/opt/prowork/scripts/workcaptain_gcp_nonprod_activate.sh

with the existing nonprod environment variables and fresh ADC.
