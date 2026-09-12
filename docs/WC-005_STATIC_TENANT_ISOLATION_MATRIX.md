# WC-005 — whole-schema tenant-isolation reconciliation (Layer A, static)

| | |
|---|---|
| **Layer** | **A — STATIC, REPOSITORY ONLY** |
| **Live `pg_catalog` consulted** | **NO** |
| **Generator** | `scripts/security/wc005_schema_matrix.js` (`--json` for the machine-readable matrix) |
| **Machine-readable output** | `docs/WC-005_static_matrix.json` |
| **Measured** | 2026-09-12 |

## What this is, and what it is not

This reconciles the **migration corpus** against the tenant-isolation contract. It does **not**
read the live database. A table reported `STATIC_CONFORMANT` is conformant *in the repo*;
whether the live database agrees is a separate proof requiring a credentialed in-VPC path.

**This is reconciliation, not a claim that tenant isolation is broken.** WC-SEC-01 is closed on
live-proven AC1–AC8 evidence and is not reopened here.

`LIVE_RLS_PROOF = BLOCKED_ON_VPC` — RDS is private; the established pattern is to hand a sealed
read-only artefact to an in-VPC operator rather than open ECS Exec / SSM / a security group.

## Result

| | |
|---|---|
| Migrations scanned | 34 |
| Tables discovered | 78 |
| Tenant-scoped (`tenant_id`) | 61 |
| `GLOBAL_REFERENCE` | 17 |
| `STATIC_CONFORMANT` | 11 |
| `STATIC_GAP` | 31 |
| `UNKNOWN_NEEDS_LIVE_PROOF` | 19 |

`11 + 31 + 19 = 61` — every tenant-scoped table is classified, none silently dropped.

**`UNKNOWN_NEEDS_LIVE_PROOF`** means RLS **and** a policy are declared but `FORCE` is not: the
table owner bypasses RLS, so conformance depends on which role the app actually connects as.
That is a live fact, not a repo fact, so it is not scored either way.

**`STATIC_GAP`** is one of three concrete conditions, reported per table:
- no RLS declared at all (the majority — `wos_*`, `worker_*`, `candidate_*`, `onboarding_*`,
  `offboarding_*`, `employment_contracts`, …), which today rely on app-layer `WHERE` filtering;
- RLS enabled with **no policy** — implicit deny-all: `contract_lifecycle_events`,
  `probation_governance_records`, `qiwa_contracts`, `wps_evidence_packs`,
  `wps_readiness_records`;
- a policy keyed on a GUC the serving code never sets.

The five no-policy tables reproduce exactly the set `20260619_wc_sec_01_force_rls.sql` recorded
from its own live verification — independent agreement between this static instrument and a
previous live measurement.

## The GUC split — checked, and currently clean

Policies key on two GUCs, and the serving code sets both:

| GUC | Type | Set in code |
|---|---|---|
| `app.current_tenant_id` | text | yes |
| `app.tenant_id` | uuid | yes |

A third, `app.current_tenant`, appears in the corpus but is **never set in code** — permanently
NULL. It was re-keyed in `20260619_wc_sec_01_force_rls.sql`, and modelling migration apply order
(later `drop policy` + `create policy` supersedes) shows no surviving policy still uses it.
**`GUCs never set in code: (none)`.**

This mattered: a union-of-files parse reported `nitaqat_preview_overrides` as still keying the
dead GUC. That was a parser artefact, not a defect — ordering must be modelled or the tool
manufactures findings.

## Instrument limits

DDL is matched textually, which suits this corpus (no dynamic DDL — asserted by the generator and
reported if it ever appears). It is weaker than a real parser. Anything undecidable is reported
`UNKNOWN`, never assumed conformant. `served_in_prod` is reported `unknown` throughout rather
than guessed from route greps.
