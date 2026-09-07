# WorkCaptain fast-lane execution — 7 Sep 2026, part 2

Canonical repo `Maqaleed-Digital/pro-work` at `~/pro-work-src`. Sibling clones fenced.

**Start** `ac6dda5` · **End** `00efc9a` · origin parity 0/0

## Merged this run

| PR | Title | Merge SHA |
|---|---|---|
| #75 | implement DL-SCANNER-NEG-CONTROL-001 — falsify the scanners' negatives | `4eed3c9` + `0815104` |
| #76 | remove an invented lead-time, add the WC-004 tracking template | `7bd7cd6` |
| #77 | CSP/HSTS/WCAG production-revision evidence package | `5f583c8` |
| #78 | stop admin back-navigation falling through to the JSON-404 apex | `00efc9a` |

**#74 was closed, not merged** — superseded by #75 with clean history (see *Scanner standard* below).

## Governance dispositions executed

All six Sponsor dispositions applied to the Portfolio Decision Log and **re-read after
writing** rather than trusted from the create/update echo.

| Row | Before | After |
|---|---|---|
| `DL-WC-RUNTIME-AUTH-001` | Proposed | **Ratified** 2026-09-07, amendment recorded |
| `DL-SCANNER-NEG-CONTROL-001` | Proposed | **Ratified** 2026-09-07, safety amendment recorded |
| `DL-096-CORRECTION-001` | Proposed | **Ratified** 2026-09-07, correction executed |
| `DL-EXEC-FRAME-RECON-001` | Proposed | **Ratified** 2026-09-07 |
| `DL-WC-SEC-02B` (duplicate) | Proposed | **Superseded**, duplicate-reference only, retained |
| `DL-069` | Ratified / unlocked | **unchanged**; scope pointer to `DL-VER-RESIDENCY-RECON-001` appended |

**`DL-096` itself was not mutated.** It carries `Immutable Lock = YES`; the correction row is
the vehicle, per the register's append-only pattern. Its body and history are intact.

**The Immutable Lock was deliberately not asserted** on any row this lane ratified. Locking is
the Sponsor's own-voice act — and `DL-MBRD-V5-FREEZE-001` records that premature locking is
exactly what produced the `DL-096` defect being corrected here. Asserting a lock from an
automated lane would repeat the error.

## Register hygiene sweep — bounded, WorkCaptain scope

| Finding | Disposition |
|---|---|
| `DL-WC-SEC-02B-001` — Ratified + Lock YES, Notes still read "PROPOSED / UNLOCKED pending Sponsor lock" | **New PROPOSED correction row** `DL-LOCKED-ROW-STALE-NOTES-001` |
| `DL-WC-SEC-02-DDL-BOOTSTRAP` (Ratified copy) — same contradiction | covered by the same row |
| `DL-WC-SEC-02-DDL-BOOTSTRAP` duplicate pair | **already correctly handled** — the superseded copy names the canonical record and is marked void-but-retained. No action. |
| `DL-069` Ratified-but-unlocked | **intentional**, dispositioned. Not an anomaly to tidy. |
| `DL-096` Ratified with empty date | dispositioned via the correction row. |

The correction row is **Proposed and unlocked**. Ratifying it is a Sponsor act; no authority was
invented.

## Scanner standard — implemented, and it immediately falsified my own evidence

`scripts/scanner_positive_controls.js` proves each detector fires on its own class before its
silence is read as evidence.

| scanner | class | result |
|---|---|---|
| gitleaks | aws-access-key · github-pat · private-key-block · **supabase-service-role-jwt** · **vercel-protection-bypass** | all **FIRE** |
| actionlint | `github.event.issue.title` | **FIRES** |
| actionlint | `github.event.deployment_status.environment_url` | **DOCUMENTED GAP** |

The two bespoke rules had **never been exercised**. A hand-written regex that never fires is
indistinguishable from having no rule at all. Both are now proven live.

### Three corrections, two of them to my own prior claims

1. **My PR #69 gitleaks "negative control" was invalid.** I reported *"a real-shaped AWS key
   planted in `app/lib/` → 2 findings, exit 1"*. Re-measured: gitleaks **does not detect** that
   key — AWS's published example key is allowlisted by gitleaks' default config because it
   appears in documentation. The 2 findings came from unrelated decoy fixtures under
   `.worktrees/`. **The control never fired; a coincidence had been read as proof.**
2. **My PR #70 claimed actionlint "now runs in CI".** It did not — comments only. It is now an
   executed step.
3. **CodeQL contributes no negative evidence.** `.github/workflows/codeql.yml` does not exist on
   `main`; it lives only on the stale unmerged branch `sprint/S8-security-release-hygiene` and
   last ran, failing, in Jan 2026. Any "no code-scanning findings" claim is **UNVERIFIED**.
   Recorded, not fixed — enabling it belongs to that lane.

### Two real CI failures this surfaced, fixed not suppressed

- **actionlint runs shellcheck on the runner** (absent locally), flagging **10 pre-existing**
  findings across `ci.yml` and `prowork_doctor.yml`. Fixed. The two SC2012 `ls`-vs-`find`
  findings in `web-assurance.yml` are accepted with an **in-script `shellcheck disable` and a
  stated reason** — run directories are runner-generated and timestamped, and newest-by-name is
  the existing assurance semantics that `find` would change.
- **The harness source itself tripped gitleaks.** Literals are now split. Because gitleaks scans
  full history and `--amend` is not used in this lane, the branch was **rebuilt from `main` as a
  single clean commit** rather than allowlisting the file whose job is to prove the scanner
  works.

### One residue that cannot be deleted

The superseded commit survives in **`refs/pull/74/head`**, which GitHub makes immutable — deleting
the branch was not enough, and `secret-scan` runs with `fetch-depth: 0`. That single dead commit
is pinned in `.gitleaks.toml`'s commit allowlist with its full justification. A path entry would
have blinded the scanner to the harness file on live branches; a regex entry would have blinded
it to the fixture shapes everywhere. **A guard test caps the commit allowlist at one entry and
requires every entry to explain why nothing narrower worked.**

## WC-003 / WC-004

Runbook validated against live metadata — every identifier in it matches measured reality, and
all five steps plus the witness and rollback sections are present.

**An invented number was removed.** Step E previously said *"expiry minus 30 days"*. That 30 was
mine, not sourced. No portfolio-wide numeric lead-time rule exists; the established pattern is
*"renewal opens as a new G1 cycle at expiry minus lead time"* with the lead time **set per item**.
Step E now follows the pattern and leaves the value to the owner.

**The WC-004 template is prepared and deliberately not created.** Every date field is
`TO_BE_FILLED_FROM_NEW_PAT` / `TO_BE_SET`, because the row opens only after the credential is
minted. *A tracking row carrying a guessed date is worse than no row: it looks tracked and is not.*

## WC-UX-NAV-001 — the apex was never the defect

Assigning `location.hash` **pushes** a history entry. Entering `/admin` without a token pushed
`#register`, and the redirect-only stub pushed `#request-access` on top — leaving the stub
*behind* the visitor, so Back re-entered it and redirected forward again. **A bounce.** Escaping
that bounce is how visitors overshot past `/admin` onto the governed JSON-404 apex.

Fixed by replace-not-push on every redirect. Entering `/admin` without a token now costs **zero**
history entries. The governed apex is untouched, and a test asserts no source in the change
navigates by pathname or replaces history to `/`.

Negative control: the pre-fix path is replayed through the same history model and **must** stack
three entries with `#register` left behind — otherwise the passing suite would prove nothing.

## Not executed, deliberately

- **`WC-001 · WC-05`** — Description is *"WC-05 register item"*; its only other content is
  Evidence Required. `DL-EXEC-DISCIPLINE-001` rule (1): no row enters execution without a
  buildable statement, and Evidence Required alone does not qualify. **UNVERIFIED, not built.**
- **The public apex landing** — `835afb1` defers it to *"a separate governed public-launch
  item"*, with a test asserting `GET /` returns the NOT_FOUND envelope. Building one would
  violate that deferral.
- **The deferred RLS live probe** — its trigger is in-VPC compute existing for another reason.
  This run created none. P0-A/P0-B remain **UNDETERMINED**.

## Verification at close

Gate runner **192 assertions across 9 declared suites**. lint · typecheck · build · app suite
41/41 · WCAG 35/35 · CWV static and real-Lighthouse · security suites · workflow guard ·
**actionlint with shellcheck** · gitleaks full history · CSP parity · migration statics ·
real-Postgres migration harness · translations.

Every result was read from a job log or a local run. No badge was taken as evidence.

## Runtime — measured, unchanged by this lane

`workcaptain:17` · desired 1 / running 1 / pending 0 · `rolloutState` COMPLETED · controller ECS ·
newest revision still `:17`. No ECS mutation, no Terraform apply, no state write, no secret read.

## Next genuine gate

**G2 — GHCR pull credential rotation. Expiry 2026-09-13.**
Then G1 for the one-task pull witness, then G1 for the CSP/HSTS/WCAG revision, whose evidence
package is prepared at `docs/runbooks/WC-CSP-HSTS-WCAG_PRODUCTION_REVISION.md`.
