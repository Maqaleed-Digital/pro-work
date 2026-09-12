# WC-007 — WorkCaptain Release Mechanism V1

| | |
|---|---|
| **Status** | **STAGE A + STAGE B BUILT — NOT EXECUTED.** No production mutation. |
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

---

## Stage A — production publish

`.github/workflows/wc-release-publish.yml` · contract in `scripts/release/release_manifest.js`

Builds from an approved commit, pushes to GHCR as the **Actions identity** (`github.token`
with `packages: write`) — **no human PAT anywhere in this path** — captures the immutable
digest from the push output, and emits a machine-readable release manifest.

It **publishes; it does not deploy**. No AWS call, no AWS credential, no ECS resource.

Derived from `ci-publish-test.yml` rather than repurposing it: that file is a disposable
proof, and a throwaway proof promoted to production machinery carries its throwaway
assumptions with it. Dispatch is fail-closed — the run refuses unless `confirm` is exactly
`PUBLISH`.

### Manifest contract

`schema_version` · `repository` · `source_commit_sha` · `source_ref` · `workflow_run_id` ·
`workflow_run_url` · `image_repository` · `image_digest` · `image_ref_by_digest` ·
`build_timestamp_utc` · `builder_identity` · `dockerfile_path`

**The release identity is the digest**, captured from the registry push output and never
reconstructed. The validator refuses a tag, a tagged `image_repository`, an abbreviated
commit sha, a non-UTC timestamp, and — the real smuggling route — an `image_ref_by_digest`
that does not equal `image_repository@image_digest`.

This matters because Stage B's guard is faithful, not clairvoyant: it will happily prove
"exactly one semantic delta" while deploying the **wrong** image if the manifest names the
wrong digest. The manifest's own validation is what has to refuse a bad identity.

### Stage A negative controls

| Control | Expected |
|---|---|
| NC-A1 tag instead of digest | REFUSED |
| NC-A2 tagged `image_repository` | REFUSED |
| NC-A3 `image_ref_by_digest` inconsistent with its parts | REFUSED |
| NC-A4 abbreviated commit sha | REFUSED |
| NC-A5 non-UTC / malformed timestamp | REFUSED |
| NC-A6 wrong `schema_version` | REFUSED |
| NC-A7 malformed digest length | REFUSED |

Plus: every required field is dropped in turn and must produce a finding naming it — so the
required-field list cannot become decorative — and `validate()` must report **every**
problem, not just the first.

## Provenance chain

```
SOURCE_MAIN_SHA → STAGE_A_WORKFLOW_RUN → GHCR_IMAGE_DIGEST → RELEASE_MANIFEST
  → LIVE_BASELINE_TASKDEF_ARN → CANDIDATE_TASKDEF → DIFF_GUARD_RESULT
  → [G1] REGISTERED_TASKDEF_ARN → RUNNING_TASK_IMAGE_DIGEST
```

The first six are provable before any production act. The final two are appended by a
future Sponsor G1 and are **not** claimed here.

## Service reference mode — measured, not assumed

The service pins an **explicit revision** (`…/workcaptain:17`), not family-latest. So the
eventual `update-service` must name the new revision explicitly; relying on family
resolution would leave the deployed candidate ambiguous.

## Rollback

`ROLLBACK_PATH=STATICALLY_VALIDATED`. The rollback target is the exact pre-release revision
ARN, known before any forward act. It is **not** `ROLLBACK_RUNTIME_PROVEN` — no rollback
drill has been run, and the existence of a correct command string is not proof it works.
