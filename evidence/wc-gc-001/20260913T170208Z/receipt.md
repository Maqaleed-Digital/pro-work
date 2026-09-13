# WC-GC-001 — Specification Gate Discovery + Remediation Receipt

**Run date:** 2026-09-13 · **Repo:** `Maqaleed-Digital/pro-work` · **Base:** `origin/main 7d1be69`
**Branch:** `wc-gc-001/discovery-remediation` · **Ledger status:** WC-GC-001 remains DRAFT / DESIGN_FROZEN / NOT_AUTHORITY / PENDING_EXPLICIT_SPONSOR_RATIFICATION.

Nothing in this run creates authority, retires or supersedes a requirement, ratifies the
DL-032 reconstruction, or performs a gated production mutation.

---

## 1. Custody

Canonical repo `~/pro-work-src` present, remote `Maqaleed-Digital/pro-work`. Its checkout sat on an
unrelated in-flight lane (`chore/generated-state-hygiene`, 2 ahead / 1 behind, own upstream) with 20
untracked files. Rather than disturb it, work was isolated into a dedicated worktree at
`~/pro-work-wcgc001` created from `origin/main`, per §1's collision clause. The in-flight lane and
its untracked files were left untouched throughout.

## 2. DL-032 recovery — **EXHAUSTED**

**D28 RESOLVED** from the authoritative register: `DL-032` / Decision Ref **D28**, *"WorkCaptain
features vs BRD scope"*, **Ratified 2026-04-24**, Immutable Lock YES, Mode Impact Mixed,
Impact `[WorkCaptain]`, Bundle 4.

**Both hash-identified artefacts RECOVERED at exact SHA-256**, each in two independent locations —
the prior Notion/Drive negatives were a search-surface gap, not absence.

**`DL032_ORIGINAL_INVENTORY_BODY` = NOT_RECOVERABLE — proven, not merely not-found.** All five
source classes are closed negative: the DL-032 Notion page body is **blank**; its `Source Doc`
relation (MPP-REV-001 V1.3.2 Sponsor Decision Sheet V2, the authority basis for DL-008→DL-034) is
**also blank**; the repo and its complete git history contain zero occurrences on any branch; the
local DL mirror is an 86-line stub without DL-032.

**Capability count recovered: 0. Mode A/D tags recovered: 0.** The RATIFIED BRD's Appendix A is a
*pointer*: *"Authoritative source: DL-032 Feature Audit … this BRD references that inventory rather
than re-specifying it."* The DRAFT→RATIFIED delta is **exactly** the status line plus that
8-paragraph appendix — so the ratification's own stated basis, *"capability-inventory appendix
incorporated"*, was satisfied by an appendix that incorporates a reference. No capability inventory
has ever existed inside the ratified BRD. The circularity is now proven from primary sources rather
than inferred.

## 3. Reverse implementation walk

830 tracked files · 33 frontend pages · 35 components · 34 declared routes · 26 API routers ·
131 unique API routes · 39 module domains / 197 module files · 6 agent files · 4 Go services ·
43 SQL files (86 CREATE TABLE, 41 ENABLE RLS, 15 FORCE RLS, 37 CREATE POLICY) · 12 workflows · 5 locales.

## 4. Orphans — 24 implementation, 5 requirement

Largest classes: **10 ROUTED_BUT_UNNAVIGABLE** surfaces (incl. the entire WC-CB Day 4–6 customer set
— `settings`, `employees`, `saudisation`, `payroll`, `trust`) that pass `canAccessRoute` on *both*
fronts yet appear in *neither* nav model, reachable only by typing the URL hash; **6 DEAD_NAV_TARGET**
nav rows with no route; **4 TESTED_BUT_UNMOUNTED** routers (hiring, lifecycle, onboarding, recruiting)
whose suites are green against the factory while the routes are unreachable at runtime.
One of the 24 is listed for traceability only: `wos_router` is classified **GOVERNED_NOT_ORPHAN** — its unmounted state is enforced by
`tests/security/sec_wc_02_dead_router.test.js` under SEC-WC-02.

## 5. Journey 1 / REQ-WC-1 — aggregate **FAIL**

PASS 4 · PARTIAL 6 · NOT_IMPLEMENTED 4 · FAIL 2 · NOT_MEASURABLE 2 (18 stages, tallied from `journey-1.json`).

The binding rule is conjunctive: current band alone is insufficient. Stages 5–8 — trajectory,
forward warning, lead time, ranked remediation — are **NOT_IMPLEMENTED with absence proven** by an
exhaustive vocabulary sweep over every tracked file (`trajector|forecast|predict|lead.?time|
time.?to.?breach|runway`): **zero** implementation hits in `app/` or `services/`; every hit is
governance prose or an unrelated occupation-codes skills list. `nitaqat_service.projectedZone` is a
**hire-impact** projection (zone after a hypothetical hire), not a time-trajectory breach forecast.
`buildRedAlerts()` emits a flat list ordered by construction sequence, not a ranking.

**No production runtime PASS is claimed for any stage.** Stages 16 and 18 are NOT_MEASURABLE, not FAIL.

## 6. Apex — **HELD_FLIP_STILL_CURRENT** `[V]` (code + history)

No `pathname === '/'` handler exists; `matchRoute()` returns null → 404 JSON NOT_FOUND envelope.
`835afb1` (2026-07-26) *"keep apex unchanged while repairing admin"*; only two commits touched
`server.js` afterwards (CSP, CI) and neither released it. A landing entry exists but is deliberately
unmounted. **Defect found:** the suite that locks this (`tests/ui/admin_surface_serve.test.js`) is
**not** on the CI gate manifest, so the apex lock proves nothing about any pushed commit.
Runtime/ingress (ALB, DNS, Route53) is **NOT_MEASURABLE** — no guess is recorded.

## 7. P1 — AWS sweep **NOT PERFORMED**

`aws sts get-caller-identity` → `NoCredentials`; no `AWS_PROFILE`, no `AWS_ACCESS_KEY_ID`. No
credential entry was attempted (that is G2). All ECS / ECR / GHCR / ALB / Route53 / CloudWatch rows
are NOT_MEASURABLE. **The WC-010 runbook contradiction was therefore NOT settled and the runbook was
NOT touched** — repairing it from an old receipt is exactly what §12 forbids. P4 reusable-tenant
pre-check: NOT_MEASURABLE.

## 8. Integrations

| Integration | Classification |
|---|---|
| Qiwa | **INTERNAL_ENGINE** |
| GOSI | **NONE** |
| Mudad | **NONE** |
| VERITAS | **INTERNAL_ENGINE** |
| HyperPay | **LIVE_API** (credential-gated) |
| Tap | **LIVE_API** (credential-gated) |
| ERP | **NONE** |

Decisive measurement: the **only** outbound HTTP in `app/modules`, `app/api` and `services` is to
payment providers. **Zero** calls to any government API. `QiwaMappingService` is 17 lines of pure
field renaming; the "Qiwa Ready" badge is `validateQiwaCompleteness()`, a local required-field
presence check.

**Public claim** *"GOSI, Mudad, Qiwa integrations via licensed partners"*: verdict
**UNSUBSTANTIATED_IN_REPO — not FALSIFIED**. The wording is deliberately hedged and disclaimed
(`trust_band.js` names what is *not* claimed; `payroll.js` states payment is partner-mediated), so
the absence of a direct client does not falsify it — but no partner adapter, config or linkage
exists either. **Not remediated:** rewriting customer-facing positioning copy is a Sponsor/brand
decision, not a code-only defect fix.

## 9. Payments

`HYPERPAY_MODE` is **PHANTOM** — read nowhere in the codebase, confirmed by independent re-measure
on 2026-09-13, which **corroborates** the env contract's own 2026-09-12 record. It already carries a
governed disposition (removal belongs to WC-008), so it is a **closed item, not an open defect**. The
real control is `HYPERPAY_ENV`, which **defaults to `production`**; live fund movement is contained by
**credential absence** (`MISSING_CREDENTIALS`), not by mode configuration. No transaction was
attempted; no credential was entered.

## 10. Ledger controls — **LEDGER_CONTROLS = PASS**

| Control | Expected | Result | Basis |
|---|---|---|---|
| GC-PC-01 positive | PASS | **PASS** | i18n completeness gate: 5 locales, 491–492 keys, exit 0 — measurable now, no credentials |
| GC-NC-01 negative | FAIL | **FAIL** | The new alias-guard suite failed 2/6 on the real defect *before* the fix, positive control passing; 6/6 after |
| GC-NM-01 measurement | NOT_MEASURABLE | **NOT_MEASURABLE** | `actionlint` binary genuinely absent locally; nothing disabled to manufacture it |
| GC-SCOPE-01 authority | UNDER_ADJUDICATION | **UNDER_ADJUDICATION** | `post_role.test.js` demands nav contain "Post a Role"; `nav-model.js` records post-role as Sponsor-deferred, reachable on neither front |

No state was manufactured, perturbed or cherry-picked to satisfy a distribution. The ordinary
discovery distribution carries no quota: PASS 9 · PARTIAL 8 · NOT_IMPLEMENTED 4 · FAIL 3 ·
NOT_MEASURABLE 5.

## 11. Remediation — 1 defect fixed

**Front-A surface-access guard was bypassable via a route alias.** `router.js` binds one page module
(`betaDashboard`) to two keys; `INTERNAL_ONLY_ROUTES` listed only `beta`. `canAccessRoute('A','beta')`
was `false` but `canAccessRoute('A','beta-dashboard')` was `true` — the same internal GTM scorecard,
which carries an executing action (`POST /admin/beta/ceo-exit-request`). Measured, not inferred:
`betaDashboard` is the **only** module in `ROUTES` bound to more than one key and the **only** one
whose keys disagreed on Front-A reachability.

Fixed in `afd29ba`. The new suite holds the **general invariant** (no module may be walled under one
key and reachable under another), asserts aliases exist before testing them so it cannot pass
vacuously, and carries a positive control so it cannot pass by walling everything. It is **added to
the CI gate manifest** — a suite left off that list does not run.

Defects found but **deliberately NOT remediated**, because authority or required behaviour is
genuinely unresolved and §19 forbids inventing product behaviour: the vacuous Saudisation-advisor
filter (no domain discriminator exists in the audit-log data model), Journey-1 stages 5–8, the
Nitaqat store interface mismatch, the phantom `typecheck`/narrow `lint` scripts, and the integration
copy question.

## 12. Verification — run, not predicted

| Check | Result |
|---|---|
| `scripts/ci_gate_tests.js` | **316/316 pass, 0 fail, 15 suites** (was 310/310, 14) |
| `app npm test` | **41/41 pass** — `origin/main` baseline **also 41/41**, confirmed on a pristine worktree |
| `npm run lint` | pass |
| `scripts/i18n/check-translations.js` | pass |
| `scripts/workflow_injection_guard.js` | pass, 0 violations |
| frontend `vite build` | succeeds |
| `scanner_positive_controls.js actionlint` | **FAIL — environment only** (`actionlint` not installed locally); verifiable in CI |
| full `tests/` tree | **1732 tests / 1614 pass / 118 fail — PRE-EXISTING on untouched `origin/main`** |

The 118 failures were measured on a clean worktree **before any edit**, lie outside the 15-suite CI
manifest, and are not hidden: CI is green while they fail. The tree also **hangs** without
`--test-force-exit --test-timeout`.

I transiently broke `nav-model.test.mjs` with the guard fix and say so plainly: that test asserted
every `INTERNAL_ONLY_ROUTES` member is also a `FRONT_NAV.B` nav row, which conflates guarded routes
with nav rows. It was made alias-aware and **gained three assertions**; coverage was not reduced.

## 13. Gates

**No mandatory gate was crossed.** NO PRODUCTION MUTATION · NO CREDENTIAL MUTATION · NO DB APPLY ·
NO TERRAFORM APPLY · NO EXTERNAL DASHBOARD ACTION · NO MERGE PERFORMED.
