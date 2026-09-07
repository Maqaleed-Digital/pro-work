# CSP / HSTS / WCAG production revision — evidence package

| | |
|---|---|
| **Status** | **PREPARED — NOT EXECUTED.** Deployment is **G1**. |
| **Prepared** | 2026-09-07, WorkCaptain fast lane |
| **Blocked behind** | **WC-003 GHCR pull credential rotation** must complete with a clean pull witness first |
| **Target commit** | `7bd7cd6c60ec3f29f711d578fc327b0d6c2b8b44` (`main`) |

## Why this is sequenced behind the credential rotation

The GHCR pull credential expires **2026-09-13**. A deployment forces a new task placement,
which forces a new image pull. If the credential is dead, the deploy is what discovers it — and
the discovery arrives as a failed rollout on the live service rather than as a controlled
rotation. **Rotate first, witness the pull, then deploy.** These are deliberately two acts, not
one bundled change.

---

## BEFORE — measured live, read-only, 2026-09-07

### Runtime

| | |
|---|---|
| Cluster / service | `workcaptain-production` / `workcaptain` (eu-central-1) |
| Task definition | **`workcaptain:17`** (newest registered revision is also `:17`) |
| Image digest | `sha256:82280b918462273b5a89533454f9d60cc7f9e1dc1b5086d542f18a0aeceb2514` |
| Repository credentials | `workcaptain/runtime/GHCR_PULL` (identifier only) |
| Runtime secrets injected | `DATABASE_URL`, `ADMIN_API_TOKEN`, `JWT_SECRET` |
| Desired / running / pending | 1 / 1 / 0 |
| Rollout state | `COMPLETED` · deployment controller `ECS` · service `ACTIVE` |

### Served response headers

| Endpoint | Result |
|---|---|
| `https://workcaptain.ai/` | **HTTP 404** — consistent with `835afb1` "keep apex unchanged while repairing admin" |
| `https://workcaptain.ai/admin` | **HTTP 200** |
| `https://workcaptain.ai/api/health` | **HTTP 200** |

Headers present on the live surface: `x-content-type-options: nosniff` ·
`x-frame-options: DENY` · `referrer-policy: no-referrer` ·
`permissions-policy: interest-cohort=()`

- **`Content-Security-Policy` — ABSENT**
- **`Strict-Transport-Security` — ABSENT**

---

## TARGET

| | |
|---|---|
| Commit | `7bd7cd6c60ec3f29f711d578fc327b0d6c2b8b44` |
| Image digest | **`TO_BE_RESOLVED`** — the build pipeline produces it. **Do not guess it**; record the digest the build actually emits and pin the task definition to that digest, not to a tag. |
| Task definition | one new revision (expected `:18`) whose **only** delta from `:17` is the image digest |

### Expected security headers after the revision

```
Content-Security-Policy: default-src 'self'; script-src 'self';
  style-src 'self' 'unsafe-inline' https://fonts.googleapis.com;
  img-src 'self' data:; font-src 'self' data: https://fonts.gstatic.com;
  connect-src 'self'; object-src 'none'; base-uri 'self';
  form-action 'self'; frame-ancestors 'none'
Strict-Transport-Security: max-age=31536000; includeSubDomains
```

`Strict-Transport-Security` is emitted **only** for TLS-terminated requests — the ALB forwards
`x-forwarded-proto: https`, and the server gates on it. It is deliberately not asserted on a
plaintext origin, where a browser would ignore it anyway.

### Expected EN / AR and RTL behaviour

`style-src` and `font-src` permit `fonts.googleapis.com` and `fonts.gstatic.com` because both
HTML entrypoints load **IBM Plex Sans, IBM Plex Sans Arabic and IBM Plex Mono** from Google
Fonts. Without those two origins the Arabic face fails to load and the RTL surface silently
degrades to a system font. This is the exact defect that shipped in PR #69 and was corrected in
PR #72 **before** any deployment; `tests/security/csp_origin_parity.test.js` now fails CI if the
markup and the policy ever disagree again.

RTL styling is driven by `[dir="rtl"]` rules in `global.css`, `layout.css` and `components.css`;
translation-key completeness is enforced at build time by `scripts/i18n/check-translations.js`
(currently: all keys verified).

### Expected accessibility behaviour

`nav.js` carries an `aria-label` on the navigation landmark (WCAG 4.1.2), `aria-current="page"`
on the active tab (WCAG 1.3.1), and an accessible name on the tenant selector (WCAG 4.1.2).

---

## WITNESS CHECKLIST — after deployment, before declaring success

Nothing below may be inferred. Each line is observed or the revision is not accepted.

**Service**
- [ ] new task reaches `RUNNING` and passes its target-group health check
- [ ] `desiredCount` unchanged at **1**; `runningCount` returns to **1**
- [ ] `rolloutState` returns to `COMPLETED`
- [ ] the previous task stays available until the replacement is healthy
- [ ] the running task uses the **expected new digest**, and nothing else changed from `:17`

**Endpoints**
- [ ] `GET /api/health` → 200
- [ ] `GET /` → same status as BEFORE (**404** unless the apex is deliberately changed in a separate act)
- [ ] `GET /admin` → 200

**Headers, on a TLS-terminated request**
- [ ] `Content-Security-Policy` present and byte-equal to the TARGET policy above
- [ ] `Strict-Transport-Security: max-age=31536000; includeSubDomains` present
- [ ] the four pre-existing headers still present

**EN / AR**
- [ ] an EN surface renders and its nav chrome is intact
- [ ] an AR surface renders, `dir="rtl"` applies, and layout is not broken
- [ ] the **Arabic font actually loads** — confirm the `fonts.gstatic.com` request is **not**
      CSP-blocked (browser console shows no CSP violation for font or style)
- [ ] no CSP violation reported for any script or style on either locale

**Accessibility / performance smoke**
- [ ] nav landmark exposes its accessible name; active tab exposes `aria-current="page"`
- [ ] tenant selector exposes an accessible name
- [ ] a CWV smoke run over the live surface stays inside budget (LCP ≤ 4000ms, INP ≤ 500ms, CLS ≤ 0.25)

---

## ROLLBACK

| | |
|---|---|
| Rollback target | task definition **`workcaptain:17`** — unchanged, still `ACTIVE`, still registered |
| Rollback image digest | `sha256:82280b918462273b5a89533454f9d60cc7f9e1dc1b5086d542f18a0aeceb2514` |
| Command outline | update the service back to `workcaptain:17` and force one placement; witness `runningCount` 1 and `rolloutState` COMPLETED on the old revision |

Rollback is a **G1** act in its own right. The rollback unit is a task-definition revision, not
a code revert — no branch, no rebuild, no history change is involved.

---

## NO-CHANGE LIST

This revision changes the container image and nothing else. Explicitly untouched:

- **Database** — no migration, no DDL, no data movement. The invoices RLS work merged this
  session is repo↔live **drift closure describing state already live since 25 Jun 2026**; it is
  **not** applied by this deployment and must not be.
- **Terraform** — no apply, no import, no state write. Live authority is `:17`; state believes
  `:2` and is non-authoritative (`DL-WC-RUNTIME-AUTH-001`, Ratified with amendment 7 Sep 2026).
- **Secrets** — `DATABASE_URL`, `ADMIN_API_TOKEN`, `JWT_SECRET` unchanged, same ARNs.
- **GHCR credential** — rotated separately, *before* this act, under WC-003.
- **DNS / TLS** — unchanged.
- **IAM / task roles** — unchanged.
- **Networking** — subnets, security groups, ALB and target group unchanged.
- **Desired count / scaling** — unchanged.

## ONE-REVISION-ONLY RULE

Exactly **one** new task-definition revision, and exactly **one** controlled placement. If the
witness fails, roll back to `:17` — do not stack a second revision on top of a failed one. A
deploy that needs a follow-up revision to become healthy is a rollback, not a fix.

---

## Pre-flight, immediately before the G1 act

- [ ] re-read `main` and confirm the target commit is still `7bd7cd6…` (or record the new one)
- [ ] re-run CI on that exact commit and read the job logs, not the badges
- [ ] confirm no unrelated change slipped into `main` since this package was written
- [ ] confirm the WC-003 rotation completed **and** its pull witness is recorded
- [ ] confirm `WC-004` exists carrying the new credential's actual expiry
