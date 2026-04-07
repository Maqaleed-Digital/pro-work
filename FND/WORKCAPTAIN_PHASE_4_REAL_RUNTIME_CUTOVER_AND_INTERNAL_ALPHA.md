# WORKCAPTAIN — PHASE 4 REAL RUNTIME CUTOVER AND INTERNAL ALPHA

Version: 1.0
Status: ACTIVE
Applies To: Source-of-truth commit a8e42e5c987f5ecb6eb8fdeecadb28a7ceadebe3

---

## 1. Purpose

This phase moves WorkCaptain nonprod from placeholder runtime activation into real runtime cutover readiness for internal alpha use.

Phase 2 established live infrastructure and placeholder runtime activation.
Phase 3 hardened runtime access and policy posture.
Phase 4 introduces the governed cutover contract for real runtime images, internal-alpha verification, and secret/runtime readiness evidence.

---

## 2. Scope

This phase includes:

1. real runtime image contract
2. internal alpha deployment manifest
3. secret version readiness contract
4. runtime cutover script scaffold
5. pre-cutover verification
6. post-cutover verification
7. rollback contract
8. internal alpha evidence pack

This phase does not include:
- production rollout
- public launch
- custom domain cutover
- external beta onboarding
- final load balancer cutover
- final observability tuning

---

## 3. Hard Rules

1. Nonprod only
2. Internal alpha only
3. No production image tags
4. No secret values in repo
5. Cutover requires explicit image URIs
6. Rollback evidence must be captured
7. Pushed commit hash is the only source of truth

---

## 4. Target Services

The internal alpha cutover contract applies to:
- api-service
- trust-processor
- agent-orchestrator
- background-worker

---

## 5. Cutover Model

The cutover process is:

1. verify baseline state
2. verify secret contract and service accounts
3. verify target image URIs are present in Artifact Registry
4. capture pre-cutover service revision state
5. deploy real runtime images
6. capture post-cutover service revision state
7. run endpoint verification
8. record rollback targets and evidence

---

## 6. Exit Criteria

This phase is complete only if:
- Phase 4 artifacts exist
- cutover script scaffold passes syntax check
- internal alpha manifest exists
- rollback contract exists
- commit is pushed

Execution of actual real-image cutover happens only when valid image URIs are provided.

---

## 7. Next Step

After this phase:
WORKCAPTAIN-PHASE-5-INTERNAL-ALPHA-OPS-AND-LB-CUTOVER
