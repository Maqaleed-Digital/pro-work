# WC-007 — WorkCaptain Release Mechanism V1

| | |
|---|---|
| **Status** | **STAGE B BUILT — NOT EXECUTED.** No production mutation. |
| **Authority** | `DL-WC-RELEASE-MECH-001` is **PROPOSED**, not ratified. This document does not confer authority and must not be cited as one. |
| **Critical path** | YES |
| **Prepared** | 2026-09-12 |

## Live baseline capture

The canonical baseline is held **once**, as the test fixture, to avoid a maintained-twice
defect between an evidence copy and a fixture that could drift apart:

    tests/release/fixtures/live-taskdef-17.json
    sha256  159fbda701a636881af2db4391b283fbfab75c32eecbfb5dbf5b8cc7d54071c8

| | |
|---|---|
| Captured | 2026-09-12, read-only |
| Command | `aws ecs describe-task-definition --task-definition workcaptain:17` |
| Identity | `arn:aws:iam::822127611052:user/stage-a-bootstrap` (ReadOnly) |
| Region / account | `eu-central-1` / `822127611052` |
| Registered by | `arn:aws:iam::822127611052:user/stage-b-build` |

Contains identifiers only — ARNs, names, revision numbers, digests and non-secret config
env values. **No secret value was read.** Container `secrets` carry `valueFrom` ARNs, which
are pointers, not material.

## Measured live state at capture

| | |
|---|---|
| Cluster / service | `workcaptain-production` / `workcaptain` (eu-central-1) |
| Task definition | `workcaptain:17` (newest registered is also `:17`) |
| Service reference mode | **explicit revision** — the service pins `…/workcaptain:17`, not family-latest |
| Deployment controller | `ECS` |
| Image | `ghcr.io/maqaleed-digital/pro-work@sha256:82280b91…eb2514` |
| Desired / running / pending | 1 / 1 / 0, rollout `COMPLETED`, target `healthy` |
| Runtime secrets | `DATABASE_URL`, `ADMIN_API_TOKEN`, `JWT_SECRET` (count 3) |
| Container `healthCheck` | **absent** — health is proven at the target group, so task `healthStatus: UNKNOWN` is expected and is not a defect |

## Why `production.yml` is not the release mechanism

Measured 2026-09-12:

- `deploy-staging` → cluster `prowork-staging`; `deploy-production` → cluster
  `prowork-production`, service `prowork-api`; region defaults to `us-east-1`.
- `us-east-1` holds **zero** ECS clusters. No `prowork-*` cluster exists in any region.
  `eu-central-1` holds `workcaptain-production`, `societa-production`, `s2ppro-production`,
  `md-web-preprod`.
- Both deploy jobs are gated `if: startsWith(github.ref, 'refs/tags/v')` and have therefore
  always been **skipped** — which is what hid the broken names behind a green run. Run
  `34195567257` on `ff9f1e7e` reports run-level `success` with `build`, `deploy-staging` and
  `deploy-production` all skipped; only `test` ran.
- Correcting the three names would still not deploy new code: `update-service
  --force-new-deployment` redeploys the task definition the service **already** references.
  It never registers a revision carrying a newly built image.

⇒ `PRODUCTION_WORKFLOW_AUTHORITY=NO`. A green "Production Deployment" run must never be read
as evidence of a deployment.

## Guard arming proof

The negative controls were proven **armed by perturbation**, not merely green:

| Perturbation | Result |
|---|---|
| `checkInvariants` neutered | 6 controls go red |
| structural diff neutered | 3 controls go red (incl. NC11, which only the diff can catch) |
| restored | 17 / 17 green |

A guard is live only when the forbidden state is attemptable. Non-vacuity is also asserted
inside the guard itself: `comparedPaths` must clear a declared floor of 35 (measured 39 on
`workcaptain:17`), so a guard that collapsed to comparing almost nothing cannot report clean.
