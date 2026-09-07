# WorkCaptain fast-lane execution — 7 Sep 2026 closure summary

Canonical repo: `Maqaleed-Digital/pro-work` at `~/pro-work-src`. Sibling clones fenced,
not read from, not written to.

**Start HEAD** `ffa3103` (branch `fix/wc-ci-gate-harness-001`) · `origin/main` `9363abf`

## 1. What merged

| PR | Title | Merge SHA |
|---|---|---|
| #69 | CWV gate evaluates something, and the gate suites actually run | `2451b4f` |
| #70 | stop event data becoming shell source in workflow `run:` blocks | `10c67dd` |
| #71 | close the invoices privilege-boundary drift, repo↔live | `e2c4cd3` |
| #72 | make the CSP match what the frontend actually loads, and tighten it | see PR |

## 2. PR #69 — pre-merge delta review: PASS

Measured at head `ffa3103`. **Carried scope disclosed rather than merged silently:** the PR
contained three commits, including `96e8b2e` (UX-001 mode/attribution treatment, authored
10 Aug 2026), which was the branch point, was not on main, and had no PR of its own. Reviewed
on its merits — 28 lines, authority MPP-UX-001 Addendum B §2A Rules 2–3 (ratified at DL-093),
existing primitives only.

Verified: gate suites run (100 assertions / 5 suites); `lighthouse` a real declared dependency;
`evaluateMetrics({})` → `pass=false`, 0 assertions; missing-audit guard present and the old
`|| 0` coercion gone; header tests boot a real server and never `require` the dead
`security_middleware` module; negative control (CSP stripped → exit 1, restored → exit 0);
gitleaks over 488 commits exit 0; no IaC, deploy, `.env` or credential-shaped content in the
diff; 11/11 CI checks green; required contexts pass; no unresolved threads.

## 3. Workflow shell-injection — root cause and repair

A GitHub Actions `${{ }}` expression is substituted **before bash parses the script**, so
event text inside a `run:` block is shell **source**, not **data**.

`web-assurance.yml` carried **eight** such interpolations. Each was traced, not assumed. The
worst spliced `steps.t.outputs.url` into a **JS string literal inside `node -e` inside a
double-quoted shell word** — a single quote escaped into JS code and `$(...)` still ran in the
shell, from one value.

Repaired by moving every value into `env:` and reading `"$VAR"`. Two further holes closed: a
newline could forge extra step outputs via `GITHUB_OUTPUT` (override URL must now be a
single-line `http(s)` URL or the step fails closed, exit 8); and `baseline.lock`'s `run_id`,
which names a directory, is constrained to a plain identifier.

**The same defect class was found in two more workflows** by the new guard and fixed
identically: `ci-publish-test.yml` (`github.event.inputs.tag`) and `production.yml`
(`github.ref_name`).

**Web Assurance semantics preserved:** OBSERVE/WARN, `block_enabled=false`, same triggers,
same trigger taxonomy, same read-only posture, `permissions: contents: read` unchanged,
central assurance ownership and policy untouched.

> **Notified in prose, not changed:** this is the product-repo-carried copy of the v0.1.1
> adapter; the same pattern is likely present upstream at `Waheebow/maqaleed-web-assurance`.
> Separately observed: `MWA_TAG: v0.1.1` is a **mutable git tag**, not a SHA, though the
> comment calls it "pinned immutable".

### Negative controls — hostile event values remain DATA

`tests/security/workflow_injection.test.js` (35/35) extracts the **real `run:` script from the
workflow file** and executes it under bash with 13 hostile payloads in env:
`$(touch …)`, backticks, `"; touch …; #`, quote escapes, `${{ … }}` text, `&`, `|`, `;`, `>`,
embedded newlines. **No marker file is ever created**; values round-trip as literal data;
multi-line values are refused with exit 8 and write nothing to `GITHUB_OUTPUT`.

**Anti-vacuous control in the same suite:** the pre-fix concatenation shape is run through the
identical harness and **does** create the marker — so a green suite cannot be meaningless.

`scripts/workflow_injection_guard.js` enforces the rule: 8 workflows scanned, **5 real
violations pre-fix, 0 after**. It bans the *construct*, not a list of names.

**actionlint would not have caught this.** actionlint 1.7.7 reports the *unfixed*
`web-assurance.yml` clean, because its untrusted-input list excludes
`github.event.deployment_status.*`, `github.event.deployment.*` and dispatch inputs — while
correctly flagging a `github.event.issue.title` probe. Both now run; neither alone suffices.

## 4. WC002-04 — invoices RLS repo↔live drift closure

**`DB_CONNECTION_USED=NO` · `DB_APPLY=NO`.** No DSN was looked up. Code authoring only.

**Already done, not redone:** `20260625_wc_sec_02_force_rls_invoices.sql` (on main since
`edd5244`) already mirrors live FORCE RLS + tenant isolation, including the line-item design —
an `EXISTS` join on `invoice_id`, **not** a denormalised `tenant_id`, because
`invoice_line_items` has no such column. Left untouched.

**Actually missing — the privilege half.** That migration states "DDL only — no grant change".
`wc_app` held DML on these tables only via the blanket
`grant ... on all tables in schema public to wc_app` in `20260619_wc_sec_01_role_rehome.sql`.
`GRANT ON ALL TABLES` is **point-in-time**: `invoices` (20260617) predates it, so a clean
replay works **by ordering, not by statement** — a failure mode 20260619's own header names.
PUBLIC was never explicitly revoked.

**public and anon handled separately.** `REVOKE ... FROM PUBLIC` does not remove privileges
held by a named role. On `anon`: this is RDS PostgreSQL, **not Supabase**; there is no `anon`
role in this role model (`prowork` / `prowork_owner` / `prowork_app` / `prowork_ddl` /
`wc_app`). The anon revoke is **guarded by a `pg_roles` check** — a standing assertion if anon
is ever introduced, a no-op today. An unguarded `REVOKE` against a non-existent role would
abort the migration and break re-runnability. **A role was not invented to satisfy a checklist.**

**Idempotency (DL-064 binding)** — executed, not claimed. Real ephemeral Postgres 16, no
credentials, container discarded:

```
bootstrap fixture ................................ OK
migration: force_rls_invoices .................... OK
migration re-apply (idempotency) ................. OK
migration: invoices grant boundary ............... OK
grant boundary re-apply (idempotency) ............ OK
strip fixture grants (sufficiency) ............... OK
grant boundary restores the grants ............... OK
assertions (RLS) ................................. ALL_ASSERTIONS_PASS
assertions (grants) .............................. ALL_ASSERTIONS_PASS
```

**Sufficiency is the point.** The bootstrap fixture grants `wc_app` DML to mirror live, so
"wc_app holds DML" could have been satisfied by the **fixture** rather than the migration. The
fixture grants are stripped — and the strip is *itself* asserted, so an ineffective revoke
cannot make it vacuous — leaving the migration as the only thing that can restore them.
**No test claims production has anything because it generated its own fixture.**

Tenant isolation verified **as `wc_app`**, never as `prowork_ddl`.

**Negative control:** removing the `wc_app` grant block → `permission denied for table
invoices`, exit 1. Restored → green, migration byte-identical.

The header records that the control has been **live since 25 Jun 2026**, that the file is
**drift closure and NOT evidence the control is newly introduced**, and that it **must not be
blindly applied to production**.

## 5. CSP/HSTS + WCAG — code side prepared, NOT deployed

**`PRODUCTION_DEPLOY=NO`.**

Reviewing the policy shipped in #69 against the **actual** frontend found two defects:

1. **It would have broken Google Fonts in production.** Both entrypoints load IBM Plex Sans,
   **IBM Plex Sans Arabic** and IBM Plex Mono from `fonts.googleapis.com`, with files from
   `fonts.gstatic.com`. The shipped policy allowed **neither** origin — it was strictly correct
   and would have silently dropped the Arabic face, degrading the RTL surface to a system font.
   Every existing test asserted the header's *presence*, none its *agreement with the markup*.
2. **It bought a real weakening for nothing.** `script-src` carried `'unsafe-inline'` behind a
   comment claiming the SPA ships an inline bootstrap script. Measured: **zero** inline
   `<script>` in the built entrypoints, no `eval()`, no `new Function()` in `app/frontend/src`.
   Removed — the policy is now **tighter than what shipped**, as well as correct.

**Not loosened gratuitously.** `style-src` keeps `'unsafe-inline'` because it is genuinely
required — several components build markup via `innerHTML` containing `style="…"` attributes,
governed by `style-src-attr` falling back to `style-src`. The test asserts the dependency **in
both directions**: if those attributes disappear, it **fails until the policy is tightened**.
`connect-src` stays `'self'` — HyperPay/OPPWA exists here only as a documented constant and in
test assertions, with no browser-side fetch, widget script or iframe.

Effective policy:

```
default-src 'self'; script-src 'self';
style-src 'self' 'unsafe-inline' https://fonts.googleapis.com;
img-src 'self' data:; font-src 'self' data: https://fonts.gstatic.com;
connect-src 'self'; object-src 'none'; base-uri 'self';
form-action 'self'; frame-ancestors 'none'
```

**Live-before evidence (read-only, 7 Sep 2026):** `https://workcaptain.ai/` served
`x-content-type-options`, `x-frame-options`, `referrer-policy`, `permissions-policy` — and
**no CSP, no HSTS**. `https://workcaptain.ai/admin` returned **HTTP 200** (DL-EC-001-3 accepted
and matching reality). The apex returned 404, consistent with `835afb1` "keep apex unchanged
while repairing admin".

**Expected after-state:** the same five headers plus `Content-Security-Policy` on every
response and `Strict-Transport-Security` on TLS-terminated requests.

**Rollback unit:** task-definition `:17` is unchanged and re-deployable. **No-change list:**
image digest, repository credentials, all three runtime secrets, environment, IAM/task roles,
networking, health settings. **One-revision-only rule:** the deploy is a single controlled
placement; no second revision.

**Dependency:** sequenced **after** the GHCR rotation has a clean pull witness, so a deploy is
never the thing that first discovers an expired pull credential. **Deployment was not executed
in this run.**

## 6. Runtime authority — measured, unchanged by this lane

`LIVE_RUNTIME_AUTHORITY=workcaptain:17` · `TERRAFORM_STATE_RUNTIME=workcaptain:2` ·
`JWT_SECRET_IMPORT_PENDING=NO` · `TERRAFORM_APPLY=NO` · `TERRAFORM_STATE_WRITE=NO` ·
`ECS_MUTATION=NO`

Re-confirmed read-only at close: service on `:17`, desired 1 / running 1, rollout `COMPLETED`,
newest revision still `:17`. No secret values were read or printed — identifiers only.
Recorded at `DL-WC-RUNTIME-AUTH-001` (Proposed, Programme Office, 7 Sep 2026).

## 7. Authorized-but-unbuilt — classification at close

| Item | Class |
|---|---|
| `/admin` surface (DL-EC-001-3) | **ALREADY_DONE** — accepted/closed, live returns 200 |
| Invoices RLS codification (SEC-FIX-WC-01B) | **ALREADY_DONE** — `edd5244` |
| Invoices privilege boundary | **DONE THIS RUN** — PR #71 |
| CWV / gate harness | **DONE THIS RUN** — PR #69 |
| Workflow injection (3 workflows) | **DONE THIS RUN** — PR #70 |
| CSP origin parity + tightening | **DONE THIS RUN** — PR #72 |
| GHCR pull credential rotation (WC-003) | **G2 + G3 + G1** — runbook prepared, not executed |
| CSP/HSTS + WCAG production revision | **G1** — sequenced behind the rotation witness |
| `SD-WC-DOMAIN-001` primary public domain | **G3** — open Sponsor decision, DNS/registrar |
| `DL-WC-RLS-PROBE-DEFER-001` live RLS probe | **G1 / blocked by design** — see below |
| `DL-WC-RUNTIME-AUTH-001` | **Sponsor act** — Proposed, awaiting ratification or strike |
| `DL-096-CORRECTION-001`, `DL-EXEC-FRAME-RECON-001` | **Sponsor governance act** — not a code lane |
| `DL-WC-SEC-02B` (Proposed) | **SUPERSEDED in practice** by `DL-WC-SEC-02B-001` (Ratified 25 Jun) |

**On the deferred RLS probe specifically:** its stated trigger is *"the next time in-VPC
compute exists for another legitimate WorkCaptain reason — WC-SEC-02A invoices work, a
GO-3-style migration, or any WorkCaptain deployment task"*. The invoices work in this run was
**code-only and created no in-VPC compute**, so **the trigger has not fired**. The row
explicitly forbids creating a bastion, enabling ECS Exec, opening SSM tunnelling or modifying
security groups for the probe. P0-A/P0-B and T1 impact remain **UNDETERMINED**; nothing in this
run waives, closes or downgrades any RLS finding.

**No SAFE_NOW code item remains unbuilt.**

## 8. Verification stack

Gate runner at close: **175 assertions across 8 declared gate suites**, 0 failures — and the
runner refuses to exit 0 on a zero-test or below-floor run.

lint · typecheck · app tests (30/30) · i18n translations · gate suites · CWV (static and real
Lighthouse) · WCAG (35/35) · security headers (9/9) · CSP parity (12/12) · workflow injection
(35/35) · invoices migration statics (28/28) · workflow guard · actionlint 1.7.7 · gitleaks
full history · real-Postgres migration harness.

CWV in real CI: **4 routes evaluated, 12 assertions expected, 12 run**, thresholds
LCP 4000ms / INP 500ms / CLS 0.25, measured LCP 718/727/717/727 ms, CLS 0.097 — non-vacuous by
the runner's own accounting.

No result in this document was taken from a green badge; each was read out of the job log or a
local run.

## 9. Remaining gated actions

1. **G2 + G3** — mint and install the replacement GHCR pull credential (**expiry 2026-09-13**).
2. **G1** — one controlled ECS task placement to witness the new pull.
3. **G1** — deploy the CSP/HSTS + WCAG revision, after that witness.
4. **G3** — `SD-WC-DOMAIN-001` primary public domain decision, DNS/registrar.
5. **Sponsor act** — ratify or strike `DL-WC-RUNTIME-AUTH-001`; correct `DL-096`.

**Next genuine gate: G2 — GHCR credential rotation, 6 days from this summary.**
