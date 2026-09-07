# WC-003 — GHCR pull credential rotation

| | |
|---|---|
| **Item** | WC-003 · GHCR pull credential expiry |
| **Expiry** | **2026-09-13** |
| **Gate class** | F-Infrastructure · **G2** (credential entry) + **G3** (GitHub console) + **G1** (task placement) |
| **Critical path** | **YES** |
| **Status** | **GATED — NOT EXECUTED.** This document is preparation only. |
| **Prepared** | 2026-09-07, WorkCaptain fast lane |

## Why this is critical path

`DL-MBRD-V5-FREEZE-001` (Ratified 2026-08-25) records in its body:

> *One dated tripwire: the WorkCaptain container-registry pull credential expires
> 13 September 2026, after which the live service cannot restart.*

It sits on a register row marked **CLOSED**, which is why it is easy to miss. Measured
against reality on 2026-09-07 (read-only):

- service `workcaptain` on cluster `workcaptain-production`, `eu-central-1`, runs
  task-definition **`workcaptain:17`**, desired 1 / running 1, rollout `COMPLETED`
- that task-definition pulls
  `ghcr.io/maqaleed-digital/pro-work@sha256:82280b918462273b5a89533454f9d60cc7f9e1dc1b5086d542f18a0aeceb2514`
- using `repositoryCredentials` →
  `arn:aws:secretsmanager:eu-central-1:822127611052:secret:workcaptain/runtime/GHCR_PULL-MRGy3U`

**A running task survives expiry.** What fails after 13 Sep is any *new pull*: a restart,
a scale event, an AZ replacement, or any new task placement. The service then cannot
recover from an ordinary interruption.

## What an agent must NOT do — and did not do

None of the following was performed, and none may be performed by an automated lane:

- read, print, test, mint, rotate or otherwise handle the credential value (**G2**)
- open the GitHub token console or any provider dashboard (**G3**)
- write to Secrets Manager (**G2**)
- register a task definition, update the service, or force a task placement (**G1**)

This lane's read-only inspection touched **identifiers only** — ARNs, names, revision
numbers, digests. No secret value was accessed.

## Operator runbook — the gated act

### Step A — mint the replacement credential  · G3 + G2

1. GitHub → the account or org that owns `ghcr.io/maqaleed-digital/pro-work`.
2. Create a **classic PAT** (or a fine-grained token with package read) carrying the
   **minimum scope**: `read:packages` **only**. No `write:packages`, no `repo`, no
   `delete:packages`.
3. Set an **explicit expiry date** and write it down. Do not choose "no expiration" —
   an unbounded token trades a dated tripwire for an undated one.
4. Record the new expiry and the owning identity **before** proceeding to Step B.

### Step B — update ONLY the pull secret · G2

Update exactly one secret, in place:

```
workcaptain/runtime/GHCR_PULL
```

- Preserve the existing JSON shape (`username` / `password`) — the ECS agent reads it
  by structure. Change the token value; do not restructure.
- **Do not touch** `DATABASE_URL`, `ADMIN_API_TOKEN` or `JWT_SECRET`.
- Do not create a new secret or a new ARN: the ARN is baked into task-definition `:17`,
  so a *new* secret would require a *new* task definition and widen the change.

### Step C — force exactly one controlled task placement · G1

One placement, no other change:

```
aws ecs update-service \
  --cluster workcaptain-production \
  --service workcaptain \
  --force-new-deployment \
  --region eu-central-1
```

- **Do not** register a new task definition. `:17` stays the runtime authority.
- **Do not** change desired count, network configuration, or any service setting.
- **Do not** run `terraform apply` — see the runtime authority note below.

### Step D — witness the pull

The rotation is not complete until every line below is observed:

- [ ] image pull **succeeds** (no `CannotPullContainerError` in service events)
- [ ] the running task uses the **expected immutable digest**
      `sha256:82280b918462273b5a89533454f9d60cc7f9e1dc1b5086d542f18a0aeceb2514`
- [ ] the task reaches **RUNNING** and passes its target-group health check
- [ ] the previous task remains available until the replacement is healthy
      (rolling deployment; do not drop to zero)
- [ ] `desiredCount` is unchanged at **1**; `runningCount` returns to **1**
- [ ] `rolloutState` returns to **COMPLETED**
- [ ] **no** new task-definition revision was created — the newest revision is still `:17`
- [ ] rollback path remains available: `:17` is unchanged and re-deployable

Read-only witness commands:

```
aws ecs describe-services --cluster workcaptain-production --services workcaptain \
  --query 'services[0].{td:taskDefinition,desired:desiredCount,running:runningCount,rollout:deployments[0].rolloutState}'

aws ecs list-task-definitions --family-prefix workcaptain --sort DESC --max-items 3
```

### Step E — make the expiry trackable, not buried

The failure mode this document exists to prevent is **not** the expiry itself — it is that
the expiry lived only inside the *body* of a register row marked CLOSED, where no status
sweep would surface it.

- [ ] record the **new expiry date** and the **owning identity** on a tracked item whose
      **Status** carries the deadline, not merely its prose — open **WC-004** using the
      template in the appendix below, filled from the ACTUAL minted expiry
- [ ] set the renewal trigger at **expiry minus lead-time**, with the lead-time **set by the
      owner for this item**

      > No portfolio-wide numeric lead-time rule for credentials was located. The
      > established pattern is the one in *03 — Product Registration Playbook V1.0*:
      > *"renewal opens as a new G1 cycle at expiry minus lead time"*, with the lead time
      > **set per item** rather than fixed globally. An earlier draft of this runbook said
      > "expiry minus 30 days"; that number was invented, not sourced, and has been removed.
      > Pick a lead-time that leaves room for a G3 mint, a G2 write and a G1 witness — WC-003
      > reached the lane with **six days**, which was not enough room to be comfortable.

- [ ] cross-reference this runbook from that item

## Runtime authority note — read before any reconciliation

Measured 2026-09-07 and recorded at `DL-WC-RUNTIME-AUTH-001` (Proposed, Programme Office):

- **Live authority is `workcaptain:17`.** Terraform state believes `workcaptain:2` —
  **15 revisions stale** — and is **not authoritative** for runtime task-definition mutation.
- An apply from current state would register a container with only **two** secrets
  (`ADMIN_API_TOKEN`, `DATABASE_URL`) and would therefore **strip `JWT_SECRET`**.
- The `JWT_SECRET` import / state write is **already complete** (both the secret and its
  version are present in state at serial 9). It is **not** pending work and must not be
  re-opened as such.
- No Terraform apply, state write, task-definition registration, service update or runtime
  reconciliation is authorized from current state. Any future reconciliation requires a new
  **measured parity plan** covering: image, repository credentials, all three runtime
  secrets, environment, IAM/task roles, networking, health settings and task-definition
  inputs.

## Sequenced behind this rotation

The CSP/HSTS and WCAG changes now on `main` are **prepared, not deployed**. Deploying them
is a separate **G1** act and is sequenced **after** this rotation has a clean pull witness —
so that a deploy is never the thing that first discovers an expired pull credential.


---

## Appendix — WC-004 tracking item template

**Do not create this row with a guessed date.** It is opened only after Step A, populated from
the **actual expiry of the credential that was minted**. A tracking row carrying a guessed date
is worse than no row: it looks tracked and is not.

**The rotation is NOT closed until this row exists.** Step D's witness proves the new credential
pulls; this row is what stops the next expiry from being discovered the same way WC-003 was —
buried in the body of a record marked CLOSED.

| Field | Value |
|---|---|
| **ID** | `WC-004` |
| **Title** | WorkCaptain GHCR pull credential next-expiry tracking |
| **Status** | `Ready` |
| **Critical Path** | `YES` |
| **Owner** | the established WorkCaptain infrastructure owner (same owner as WC-003) |
| **Capability** | WorkCaptain |
| **Track** | 8-WorkCaptain |
| **Stream** | A — Engineering Completion |
| **Phase** | Phase 1 |
| **Gate** | F-Infrastructure |
| **Surface Repo** | `Maqaleed-Digital/pro-work` |
| **Expiry Date** | `TO_BE_FILLED_FROM_NEW_PAT` — the actual expiry recorded in Step A |
| **Trigger Date** | `expiry minus lead-time`; **lead-time TO_BE_SET by the owner** (see note in Step E — no portfolio-wide numeric rule exists, and none is invented here) |
| **Authority** | the WC-003 rotation witness (Step D), plus this runbook |
| **Dependencies** | none to open the row. Acting on it is again G3 (mint) + G2 (secret write) + G1 (task placement). |
| **Evidence Required** | new PAT minted with `read:packages` only and its expiry recorded; `workcaptain/runtime/GHCR_PULL` updated; one forced task placement observed pulling the expected immutable digest successfully **before** the expiry. Reported-rotated ≠ witnessed-pulling. |
| **Closure** | next rotation completed **and** one-task pull witness observed **and** the following expiry tracked on its own row |

### Body text to carry over

> Created from the WC-003 rotation witness on `<date>`. The previous credential expired
> `2026-09-13`; this row tracks the replacement minted in that rotation.
>
> **Banked lesson, carried forward:** WC-003 existed only inside the body of a ratified record
> marked CLOSED, with no owner, no date field and no execution item — a dated production hazard
> that a Status-only sweep could not see. This row exists so that never recurs. Reading a
> register row's Status alone would have missed a six-day production tripwire: **Status AND
> body AND reality — never one alone.**
