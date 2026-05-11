# WorkCaptain Customer-Facing Surface — Phase 0 Proposal

**Document ID:** PROWORK-PROPOSAL-CB-V1 (controlled-beta build proposal)
**Date authored:** 2026-05-11 (D-5 from D15 launch ~2026-05-16)
**Status:** AWAITING SPONSOR APPROVAL — no product code beyond this proposal has been written
**Authority basis:** Sponsor brief (controlled-beta build), Sponsor decisions B1–B5 + B-extra + B-extra-2 issued 2026-05-11
**Boundary:** Operational substrate proposal under WC Constitutional Launch Window (active D15→D15+41 ~2026-05-16 → 2026-06-26). Honours WC-OPS-001 V1.0 window prohibitions.

---

## §1 · Survey Findings

### §1.1 Repo identity and stack
- Working copy: [/opt/prowork](/opt/prowork). Active branch tip 20–21 Apr.
- `package.json` `name: "pro-work"` — hyphenation accepted per Sponsor B-extra-2 (npm naming convention; backend identifier `prowork` semantically preserved per BA-001 §6).
- Node.js stack (root). Vite-based customer UI. Go service coexists at [services/api-service](/opt/prowork/services/api-service) but is small and out of scope for this UI build.
- Memory context: S36–S39 sovereign activation runway closed 2026-04-16 (28/28 gates, 581 tests). The customer surface in this build sits on top of that ratified runway.

### §1.2 Existing frontend inventory (binding context — there is already a substantial customer UI)
| Surface | Path | Stack | Disposition under Sponsor B2 |
|---|---|---|---|
| Authenticated app (existing) | [app/frontend](/opt/prowork/app/frontend) | Vite SPA, ESM, vanilla JS, custom CSS | KEEP STACK. Rename mount `/admin/`→`/app/`, title "WorkCaptain Admin"→"WorkCaptain", audit tokens against G1 V1.1.1 |
| Admin console | [admin-console](/opt/prowork/admin-console) | Next.js 14 + Tailwind | Untouched — internal-only admin |
| Trust explorer | [trust-explorer](/opt/prowork/trust-explorer) | Next.js 14 + Tailwind | Untouched — internal-only |
| Public landing | [app/landing](/opt/prowork/app/landing) | static index.html | REPLACE per brief §1 — new Vite-built public surface |

The Vite SPA has 32 pages already including `register`, `signin`, `accept_invite`, `onboarding`, `dashboard`, `compliance`, `compliance_nitaqat_detail`, `compliance_wps_list`, `compliance_esb_list`, `compliance_probation_list`, `identity`, `marketplace`, `evidence`, `governance`, `data_privacy`, `fee_transparency`, `ai`, `beta_dashboard`, `workers`, `pods`, plus seeker-side pages. Locales `ar/en/es/fr/ur` exist; WCAG 2.4.1 skip-link wired. Component primitives present: `ai_explainability`, `confidence_gauge`, `kpi_strip`, `compliance_risk_screen`, `agent`-adjacent surfaces.

### §1.3 Existing API surface
Node API at [app/api](/opt/prowork/app/api) — ~30 router modules covering the entire WC controlled-beta brief surface:

| Brief section | Existing router(s) |
|---|---|
| §2 Auth + onboarding | [auth_router.js](/opt/prowork/app/api/auth_router.js) (POST `/api/auth/register`, `/login`, `/logout`, `/refresh`, `/me`), [employer_onboarding_router.js](/opt/prowork/app/api/employer_onboarding_router.js), [invitation_router.js](/opt/prowork/app/api/invitation_router.js) |
| §3.1 Dashboard | [dashboard_router.js](/opt/prowork/app/api/dashboard_router.js) |
| §3.2 Employees | [identity_eri_router.js](/opt/prowork/app/api/identity_eri_router.js), [recruiting_router.js](/opt/prowork/app/api/recruiting_router.js), [hiring_router.js](/opt/prowork/app/api/hiring_router.js), [onboarding_router.js](/opt/prowork/app/api/onboarding_router.js), [lifecycle_router.js](/opt/prowork/app/api/lifecycle_router.js) |
| §3.3 Saudisation | [nitaqat_router.js](/opt/prowork/app/api/nitaqat_router.js), [occupation_code_router.js](/opt/prowork/app/api/occupation_code_router.js) |
| §3.4 Payroll | [wps_readiness_router.js](/opt/prowork/app/api/wps_readiness_router.js), [fee_transparency_router.js](/opt/prowork/app/api/fee_transparency_router.js), [payout_matrix_router.js](/opt/prowork/app/api/payout_matrix_router.js) |
| §3.5 Compliance | [compliance_overview_router.js](/opt/prowork/app/api/compliance_overview_router.js), [compliance_risk_router.js](/opt/prowork/app/api/compliance_risk_router.js) |
| §6 PDPL + audit + export | [pdpl_router.js](/opt/prowork/app/api/pdpl_router.js) (DSR ACCESS / RECTIFICATION / ERASURE / PORTABILITY / OBJECTION / RESTRICTION; 30-day SLA), [evidence_pack_router.js](/opt/prowork/app/api/evidence_pack_router.js) (60-second export SLA, hash-integrity, tenant-isolated, role-redacted) |

Auth model: JWT Bearer token via `Authorization: Bearer …`. `POST /api/auth/register` creates tenant + owner user atomically. No federation. No Wathq integration (mentioned in [employer_onboarding](/opt/prowork/app/api/employer_onboarding_router.js) PATCH `/api/onboarding/profile` — accepts `establishment_name`/`activity_code`/`region`/`total_employees`/`saudi_employees` without external validation).

### §1.4 CI/CD posture (binding-rule conflict noted; OUT OF SCOPE per Sponsor B3)
[.github/workflows/production.yml](/opt/prowork/.github/workflows/production.yml) deploys to AWS using long-lived `AWS_ACCESS_KEY_ID`, pushes images to ghcr.io. Conflicts with Cloud Blueprint v2.1 §11–§13 (me-central2, WIF, Artifact Registry immutable tags, Binary Authorization). Per Sponsor B3: do not touch the workflow. Document the gap in DEPLOYMENT.md as a known item, tracked separately. Manual `gcloud run deploy` for the controlled-beta window.

### §1.5 Governance docs read
- UX-G1-TOKENS V1.1.1 (read in full; binding via IDE excerpt + ~/Downloads .docx converted)
- UX-G2 V1.1 Component Library (read in full)
- UX-G2-INV-001 V1.1 Master Surface Contract Inventory (read in full — §1–§13)
- MPP-PDS-001 V1.1 (read §1–§5)
- MPP-RM-001 V1.1 (binding facts received inline from Sponsor B1(b))
- MPP-WC-OPS-001 V1.0 (read in full — D-Day runbook + E1–E6 evidence streams)
- MPP-WC-OPS-001-T V1.0 (templates pack — not read in detail; not binding for this UI build)
- UX-G2-INV-001-A V1.1 (UX Intelligence Surfaces, 2725 lines) — **NOT read**; covers IAF Addendum K Cluster 2 obligations which are OUT OF SCOPE for WC controlled-beta
- UX-G2-INV-001-B V1.0 Phase 2 Cluster 3 (Disclosure, 1204 lines) — **NOT read**; covers Addendum A Phase 2 disclosure detail which is OUT OF SCOPE for this window

Missing docs (six items) covered by Sponsor B1(b) inline binding extracts: MPP-UX-001 §4.4/§5.1/§5.2/§5.4/§7 Pillar 1; MPP-BA-001 §6/§11; MPP-MA-001 §3 Invariant 2 + §7.1 + §2 agent triad; MPP-BNO-001 §4/§7 (stub-for-WC-beta); MPP-AM-001 (Mode-A 5-test, Mode-D advisory, no payment); Cloud Blueprint v2.1 §11–§13; MPC-V1.0 Five Non-Negotiable Conditions; WC Controlled-Launch Memo V1.1 (cohort ~25–30, controlled-beta posture).

---

## §2 · Proposed Frontend Tech Stack (per Sponsor B2)

### §2.1 Stack decision — keep existing
| Concern | Decision | Rationale |
|---|---|---|
| Build tool | **Vite 7** (existing) | Sponsor B2 binds the existing stack |
| Language | **Vanilla JS (ESM)** (existing) | No React, no JSX, no TypeScript |
| Styling | **CSS custom properties + class-based components** consuming canonical G1 V1.1.1 tokens (replicated locally per Sponsor B-extra) | Vanilla; no CSS-in-JS framework |
| Routing | **Hash-based client router** ([app/frontend/src/router.js](/opt/prowork/app/frontend/src/router.js)) — existing | Already in use |
| i18n | **Existing locale.js + JSON locale files** (ar/en) | RTL via `dir="rtl"` on `<html>` + CSS logical properties |
| API client | **Hand-written typed wrappers** per Sponsor B4, co-located at `app/frontend/src/api/` with comment headers citing the source router file | No OpenAPI generation |
| Auth | **Bearer JWT** (existing `apiPostPublic` / `setToken` model) — backend [auth_router.js](/opt/prowork/app/api/auth_router.js) | No new auth backend |
| Marketing landing | **Same Vite build, separate entry** at `/index.html` (apex) | One toolchain |
| Testing | **Existing puppeteer + axe-core WCAG audit** in [scripts/wcag_audit.js](/opt/prowork/scripts/wcag_audit.js) | Already wired |

### §2.2 What is NOT being used (and why)
- ❌ Next.js / React — would replace working code; violates Sponsor B2 "keep the stack"
- ❌ Tailwind CSS — existing UI uses custom CSS; introducing Tailwind mid-window risks regression and conflicts with the existing 1617-line CSS surface
- ❌ shadcn/Radix component library (UX-G2 V1.1 §2.1 G2-D1) — that library is portfolio-shared, lives in `credito-platform/packages/ui`, is React-native, and is OUT OF SCOPE per the Constitutional Launch Window's "no Addendum A activation" prohibition. We satisfy UX-G2 V1.1 **semantically** (anatomy, accessibility, RTL, agent attribution, mode treatments, regulator-surface conventions) via vanilla-JS equivalents, not by literal shadcn install.
- ❌ Storybook (G2-D2) — operator preview surface, out of scope for the customer build
- ❌ TypeScript — keeping with existing vanilla JS; type-checking deferred

### §2.3 Honouring UX-G2 V1.1 semantically (binding contracts retained)
The following UX-G2 V1.1 contracts apply at the vanilla-JS component level:
- §3.4 component anatomy: every interactive component exposes ARIA roles, keyboard handlers, focus management
- §5 mode treatments (Mode A / Mode D / HITL)
- §6 AgentAttributionMarker (non-removable; bilingual; persistent)
- §7 regulator-context conventions (Nafath stub, GOSI/Qiwa/Mudad informational, endorsement disclaimer)
- §8 RTL: logical properties only; `ms-*/me-*/start-*/end-*` analogues in CSS; mirror-aware chevrons
- §9 WCAG 2.2 AA (axe-core CI gate via existing [scripts/wcag_audit.js](/opt/prowork/scripts/wcag_audit.js)); AAA for regulator-facing per UX-001 §4.3
- §10.4 layered disclosure (Layer 1 Summary / Layer 2 Detail / Layer 3 Audit trail) for surfaces with >2 evidence factors

---

## §3 · Proposed Package / Folder Layout

```
app/frontend/                                       (existing — extended, not rewritten)
├── index.html                  ← rename title "WorkCaptain Admin" → "WorkCaptain"
├── vite.config.js              ← base '/admin/' → '/app/'; add second entry for '/'
├── src/
│   ├── main.js                 ← existing app entry (unchanged behaviour, retargeted)
│   ├── public/                 ← NEW — public marketing surface (Sponsor B2 modified Option A)
│   │   ├── landing.js          ← brief §1 marketing landing
│   │   ├── request_access.js   ← brief §2 cohort registration form
│   │   └── signin_entry.js     ← brief §2 cohort sign-in entry (delegates to existing signin)
│   ├── brand/                  ← NEW (Sponsor B5 — brand-variant config)
│   │   ├── workcaptain.ts      ← B2C/SMB variant (active for controlled beta)
│   │   ├── maqaleed-workforce.ts ← B2G/corporate variant (config-only; no deployment in beta)
│   │   └── index.js            ← runtime variant resolver from VITE_BRAND env
│   ├── api/                    ← NEW (Sponsor B4 — hand-written typed wrappers)
│   │   ├── auth.js             ← consumes app/api/auth_router.js
│   │   ├── employer_onboarding.js ← consumes app/api/employer_onboarding_router.js
│   │   ├── invitation.js       ← consumes app/api/invitation_router.js
│   │   ├── dashboard.js, nitaqat.js, wps_readiness.js, compliance.js, identity_eri.js, lifecycle.js,
│   │   │   pdpl.js, evidence.js, ai.js
│   │   └── README.md           ← one-line per file pointing to source router
│   ├── components/             ← existing — extended
│   │   ├── agent_attribution_marker.js  ← NEW (UX-G2 §6 vanilla equivalent)
│   │   ├── mode_disclosure_banner.js    ← NEW (UX-G2 §5)
│   │   ├── hitl_prompt_card.js          ← NEW (UX-G2 §5.3)
│   │   ├── regulator_badge.js           ← NEW (UX-G2 §4.6 + §7)
│   │   ├── source_citation.js           ← NEW (UX-001 §7.3)
│   │   ├── explainability_bundle.js     ← NEW (UX-001 §7.3 layered disclosure)
│   │   ├── audit_trail_link.js          ← NEW (UX-001 §7.6)
│   │   ├── kpi_card.js                  ← rename/extend kpi_strip.js per UX-001 §5.4 grammar
│   │   ├── controlled_beta_banner.js    ← NEW (WC Controlled-Launch Memo V1.1)
│   │   └── (existing 17 components preserved)
│   ├── tokens/                 ← NEW (Sponsor B-extra — replicate canonical locally)
│   │   ├── colour.css          ← replicated verbatim from credito-platform/packages/design-tokens
│   │   ├── elevation.css, radius.css, typography.css, spacing.css, motion.css, iconography.css
│   │   ├── index.css           ← @import aggregator
│   │   └── HEADER.md           ← canonical-source pointer + post-D15+41 extraction TODO
│   ├── styles/                 ← existing — drift resolved against tokens/ during build (see §6)
│   ├── pages/                  ← existing — title/copy passes per brief §1–§6
│   ├── locales/                ← existing — add cohort/controlled-beta strings; reaffirm ar primary
│   ├── locale.js, api.js, router.js  ← existing — preserved
│   └── (existing files preserved)
├── public/                     ← existing static assets
└── (existing config preserved)
```

No new top-level directories at repo root. Build output unchanged. Single Vite project; two entries (`/index.html` apex + `/app/index.html` authenticated).

---

## §4 · Filtered Surface Obligation List (UX-G2-INV-001 V1.1 → WC controlled-beta)

86 obligations across 20 categories. Brief §0.5 filter applied: in-scope = UX-001 §4–§9 / MA-001 §2 / BA-001 §6+§11 / BNO-001 surface hooks. Out-of-scope = Crédito-only, IAF/Addendum K, S2PPRO-specific, CERTUS-Trust-Domain platforms (WC is OUTSIDE per MA-001 §7.1).

**Tally:** 40 IN, 14 PARTIAL (binding pattern applies; Crédito-specific wording adapted to WC analogue), 32 OUT.

### §4.1 IN-SCOPE obligations (40 + 14 partial = 54 binding for WC controlled-beta)
| Cat | OBL-ID | Title | Treatment in WC v1 |
|---|---|---|---|
| A | A-01 | Unified sign-on with Nafath/Absher compatibility | Nafath placeholder stub per UX-001 §5.1 (button visible, disabled, "Coming soon") |
| A | A-02* | Portfolio-wide identity surface | PARTIAL — WC-local for beta; Umbrella inheritance hook absent (OOS) |
| A | A-03 | Step-up authentication for regulated capabilities | Stub for D-Day; full step-up post-window |
| B | B-01 | Persistent Mode-state status indicator | Every WC revenue-eligible capability per brief §4 |
| B | B-02 | Mode-D categorical-prohibition language | Binding wording per RM-001 §10.1 |
| B | B-03 | Mode D → Mode A transition discipline | One-way; ToS re-acceptance pattern (no in-window activation) |
| B | B-04* | Activation red guard on customer-facing pricing | PARTIAL — pricing informational only during beta; Mode-D framing applied |
| B | B-05 | Pilot Agreement disclosure | Controlled-beta acknowledgement screen per brief §2 |
| C | C-01 | Agent attribution chip | UX-001 §7.7 + MA-001 §2; non-removable on every agent output |
| C | C-02 | Calibrated confidence band | Low/Medium/High; numeric only if backend supplies calibrated values |
| C | C-03 | Layered explainability bundle | Layer 1 default visible, Layer 2 expand, Layer 3 audit deep-link |
| C | C-04 | Source citations | Clickable; timestamp + type + authority |
| C | C-05 | Advisory vs Directive visual language | Distinct treatment per UX-001 §7.5 |
| C | C-06 | Override paths discoverable | Reject / Modify / Escalate buttons on every agent output |
| C | C-07* | Disposition recording | PARTIAL — WC-adapted dispositions; not Crédito 4-disposition schema verbatim |
| C | C-08 | Agent-version visibility | Hover/tap reveals; reproducibility tag |
| C | C-09 | Orphaned outputs prohibited | Runtime-rejection contract enforced at render |
| E | E-01* | HITL queue with SLA-clock and bypass-prohibition | PARTIAL — pattern applies; Crédito 5-trigger schema does not |
| E | E-03 | HITL multi-approver patterns | Org-admin segregation-of-duties hook |
| E | E-04 | Confidence-below-threshold auto-HITL | UX-001 §7.4 |
| F | F-01 | Audit-trail deep link from every agent output | Brief §6 |
| F | F-02 | Override audit-trail visualisation | 8-attribute VERITAS event; correlation ID |
| F | F-03 | VERITAS event log surfacing | WC ingest target per MA-001 |
| F | F-05 | Disclosure-version reconstructibility | Per render |
| G | G-01 | Public commercial brand application (Pattern A) | "WorkCaptain"; backend identifier `prowork` preserved per BA-001 §6 |
| G | G-02 | Dual-brand Pattern B | Sponsor B5 — config-driven from day one |
| G | G-03* | Pricing surface activation | PARTIAL — Mode-D pricing only during beta |
| G | G-04 | Email + notification branding consistency | Sender/footer per BA-001 |
| H | H-01 | Regulator iconography + jurisdictional labelling | Nafath/Absher (auth); GOSI/Qiwa/Mudad (informational) |
| H | H-02* | Regulator-facing AAA accessibility | PARTIAL — AAA applied to regulator-surfaces where contrast permits |
| H | H-03 | Endorsement disclaimer | Already covered in UX-G2 V1.1 component contract |
| H | H-04 | MPP-LO authority on regulator-facing instruments | Counsel-opinion non-override note in regulator surfaces |
| I | I-01* | Four-category adapter taxonomy surface treatment | PARTIAL — Regulatory (GOSI/Qiwa/Mudad) + Partner (HyperPay) only |
| L | L-01 | WCAG 2.2 AA portfolio-wide minimum | CI gate via existing axe-core script |
| L | L-02* | WCAG 2.2 AAA for regulated-sector surfaces | PARTIAL — applied to regulator-facing surfaces |
| L | L-03 | Arabic-first bilingual discipline | RTL primary; CSS logical properties only; locale toggle persistent |
| L | L-04 | Currency symbol trailing (Arabic convention) | SAR display per payroll module |
| L | L-05 | Reduced-motion alternatives | `prefers-reduced-motion` honoured |
| M | M-01* | Single notification taxonomy | PARTIAL — WC-local; Umbrella aggregation OOS |
| M | M-02* | Customer-config-aware notification routing | PARTIAL — settings preference (brief §3.6) |
| N | N-02 | Capability-deferred indicators across dashboard | Mode-D chip on each KPI |
| N | N-03 | Report exports with attribution preservation | Existing [evidence_pack_router.js](/opt/prowork/app/api/evidence_pack_router.js) supplies; UI consumes |
| O | O-01* | API design standard | PARTIAL — applies to existing API; not customer-UI authoring scope |
| P | P-01* | Decision-support disclosure (binding wording) | PARTIAL — WC analogue: "WorkCaptain provides decision-support. Customer authority retained for HR/payroll actions." |
| P | P-02* | Non-custodial disclosure | PARTIAL — WC analogue: "WorkCaptain does not hold funds; payment processing is partner-mediated." |
| P | P-03 | PDPL Article 12 channel disclosure | Backend [pdpl_router.js](/opt/prowork/app/api/pdpl_router.js) ACCESS DSR supplies; UI in brief §6 |
| P | P-04 | PDPL Article 18 channel disclosure | Backend ERASURE DSR supplies |
| P | P-05 | PDPL Article 24 channel disclosure | Backend OBJECTION DSR supplies (close-fit alias) |
| P | P-06* | Consent origination boundary disclosure | PARTIAL — WC-internal consents; cross-platform inheritance OOS |
| Q | Q-01 | Activation gate evidence pack surface | AM-001 §10 5-test gate referenced; activation OOS in-window |
| Q | Q-03 | Deferred-capability fence | Mode-D capabilities surfaced per brief §4 |
| T | T-01 | Component versioning as horizontal capability | Tokens replicated locally with HEADER.md canonical-source pointer per Sponsor B-extra |
| T | T-02 | Surface-version metadata at every render | Disclosure-version metadata captured in render payload |
| T | T-03* | Disclosure-change history audit | PARTIAL — per-render metadata in scope; quarterly Design Council review OOS |

\* = partial; binding pattern applied with adaptation noted.

### §4.2 OUT-OF-SCOPE for WC controlled-beta (32 obligations)
- **D-01..D-05** (Evidence & Provenance — IAF/AI-SPM scope; Condition 3 binding)
- **E-02** (HITL Crédito-specific 5-trigger reason codes)
- **F-04** (CERTUS Trust Ledger surfacing — WC is OUTSIDE CERTUS per MA-001 §7.1)
- **I-02** (Internal adapter data-flow — operator surface, not customer UI)
- **J-01..J-10** (IAF Intelligence — net-new Addendum K; Constitutional Launch Window prohibits Addendum A activation)
- **K-01..K-05** (Cross-Platform & Network / BNO / Umbrella discovery — brief OOS)
- **N-01** (Maqaleed Umbrella Dashboard canonical grammar — brief OOS, inheritance hooks only)
- **O-02** (Developer Portal TTFC — not customer UI)
- **O-03** (API attribution-preservation directive — not authored in this window)
- **R-01, R-02** (Umbrella centralisation, sector autonomy — WC is vertical, not sector; Umbrella OOS)
- **S-01..S-03** (Design Council operations — operator surface)

---

## §5 · Design-Tokens Decision (per Sponsor B-extra)

**Decision:** Replicate canonical tokens locally inside prowork at [app/frontend/src/tokens/](app/frontend/src/tokens/) with one-line HEADER.md comment pointing to canonical source. Extract to shared `@maqaleed/design-tokens` consumption post-D15+41.

### §5.1 Replication
Files copied verbatim from `/Users/waheebmahmoud/dev/credito-platform/packages/design-tokens/src/` into `app/frontend/src/tokens/`:
- `colour.css` (V1.0 §3 + V1.1.1 §3.6–§3.8 — 23 additive properties; ratified 2026-05-09)
- `elevation.css` (V1.1.1 §3.4)
- `radius.css` (V1.1.1 §3.5)
- `typography.css` (IBM Plex Sans Arabic / Sans / Mono only)
- `spacing.css`, `motion.css`, `iconography.css`
- `index.css` (aggregator)

`HEADER.md` in `app/frontend/src/tokens/` records: canonical source path, governance authority (UX-G1 V1.1.1 RATIFIED 2026-05-09), anti-mutation discipline (`§10 backwards compatibility` — local copy must remain byte-identical to canonical), extraction TODO for post-D15+41.

### §5.2 Audit findings — existing [app/frontend/src/styles/design-system.css](/opt/prowork/app/frontend/src/styles/design-system.css) drift
The S42-authored `design-system.css` (79 lines) drifts from canonical in 8 ways. Resolution policy per Sponsor B-extra: **canonical wins**; existing values yield.

| Drift item | Existing | Canonical (V1.0/V1.1.1) | Resolution |
|---|---|---|---|
| Variable prefix | `--color-*`, `--font-*`, `--space-*`, `--shadow-*`, `--radius-*` | `--maq-brand-*`, `--maq-font-*`, `--maq-space-*`, `--maq-elevation-*`, `--maq-radius-*` | **Rename to `--maq-*` everywhere; provide alias-only fallback in styles/legacy-alias.css during migration window (removed by D-1)** |
| Brand primary hex | `#0A1628` | `--maq-brand-primary: #1E3A5F` (V1.0 RATIFIED) | **Canonical wins** — V1.0 anti-mutation discipline |
| Brand accent hex | `#C4922A` | `--maq-brand-accent: #C9A227` | Canonical wins |
| Semantic success | `#059669` | `--maq-semantic-success: #0E7C3A` (WCAG 5.2:1 on white) | Canonical wins |
| Semantic warning | `#D97706` | `--maq-semantic-warning: #A85D00` (WCAG 4.6:1) | Canonical wins |
| Semantic danger | `#DC2626` | `--maq-semantic-danger: #B0271E` (WCAG 5.8:1) | Canonical wins |
| Semantic info | `#2563EB` | `--maq-semantic-info: #1E3A5F` (WCAG 9.4:1; matches brand primary) | Canonical wins |
| Display font | `Playfair Display` | NOT in canonical (only IBM Plex family) | **Remove** — G1 binding prohibits non-canonical fonts; existing `font-family:var(--font-display)` usages migrate to `--maq-font-arabic` / `--maq-font-latin` weight semibold/bold |

### §5.3 New token surfaces required
- Mode-state tokens (`--maq-mode-a`, `--maq-mode-d`, `--maq-mode-d-bg`, `--maq-hitl-pending`, `--maq-agent-attributed`, `--maq-agent-attributed-bg`) — already present in canonical V1.0 §3.4; existing CSS lacks them → adopt as-is
- V1.1.1 additive properties (23 props) — soft tints, on-* foregrounds, hover/active variants → adopt as-is
- Nitaqat zone palette (existing `--zone-platinum/high-green/medium-green/low-green/yellow/red`) — WC-specific; NOT in canonical G1. Per Sponsor B-extra discipline: **keep as additive WC-local layer**, rename to `--maq-wc-zone-*` to signal WC-namespace, document in `tokens/HEADER.md` as additive-on-canonical pending future G1 amendment. Values preserved.

### §5.4 Token migration mechanics (no churn)
1. Add `app/frontend/src/tokens/index.css` to [index.html](/opt/prowork/app/frontend/index.html) as first stylesheet import
2. Rewrite [styles/design-system.css](/opt/prowork/app/frontend/src/styles/design-system.css) to provide deprecated-alias variables (`--color-primary: var(--maq-brand-primary);` etc.) — temporary bridge
3. Mechanical search-replace in [styles/](/opt/prowork/app/frontend/src/styles/) + [components/](/opt/prowork/app/frontend/src/components/) + [pages/](/opt/prowork/app/frontend/src/pages/): `var(--color-primary)` → `var(--maq-brand-primary)`, etc.
4. Run existing `npm run wcag:audit` to verify no contrast regression
5. Remove the alias bridge by Day 6 (D-1) and verify with `grep -r "color-primary" src/` returning zero hits

---

## §6 · Phased Build Sequence (D-5 → D-Day → D+2, mapped to brief sections 1–8)

Today is **D-5 (2026-05-11)**. D-Day launch ~**2026-05-16 (D15)** per WC-OPS-001. Building 7 calendar days = D-5 through D+2 (2026-05-13). Aligns with WC-OPS-001 §2.10 gate checkpoints (G-3 / G-2 / G-1 / G-0).

| Day | Date | WC-OPS Gate | Build deliverable |
|---|---|---|---|
| 1 | 2026-05-11 (D-5) | — | Replicate tokens + audit drift; controlled-beta banner + bilingual scaffold; brand-variant resolver (Sponsor B5) |
| 2 | 2026-05-12 (D-4) | — | **Section 1**: Public landing at `/`; Pattern A "WorkCaptain" brand; trust band (PDPL, KSA residency, SAMA-aware, NCA-ECC-aware posture); WC-SAUD / WC-PYR / WC-WFA / WC-REC / WC-B2G feature sections with Mode-A/D status chips; "Request access" CTA (not "Sign up free") |
| 3 | 2026-05-13 (D-3) | G-3 BLOCK sweep | **Section 2**: Cohort registration + sign-in flow; Nafath stub button (disabled with "Coming soon"); email verification; first-time employer onboarding wizard; controlled-beta acknowledgement screen (B-05); CR number format validation only (no Wathq); manual invitation flow via `invitation_router` |
| 4 | 2026-05-14 (D-2) | G-2 BLOCK sweep | **Section 3.1 + 3.6**: Authenticated dashboard with KPI cards (UX-001 §5.4 canonical grammar); empty states; settings; locale persistence; org profile; **Sections 4 + 5 transverse**: Mode-state chip framework + AgentAttributionMarker + ExplainabilityBundle + HITLPromptCard primitives wired |
| 5 | 2026-05-15 (D-1) | G-1 final sweep | **Section 3.2 + 3.3 + 3.4 + 3.5**: Employees, Saudisation (Nitaqat agent advisory + 3 Hard Guardrails), Payroll (WPS read-only OK), Compliance (filing calendar, reminders); **Section 7 across-the-board**: empty/loading/error/permission-denied/service-unavailable states; **Section 8**: queued-action / resumable-onboarding patterns |
| 6 | 2026-05-16 (D0) | G-0 launch | **Section 6**: Audit-trail viewer (consumes `evidence_pack_router`); consent ledger view (consumes `pdpl_router`); data export CSV/PDF (60s SLA); residency confirmation surface; **Pre-launch smoke + WCAG audit + manual TEST_PLAN.md walk-through** |
| 7 | 2026-05-17 (D+1) | D+1 monitoring | Bug-fix window; cohort feedback intake; capability-deferred banners review; finalise DEPLOYMENT.md commands and verify gcloud deploy dry-run (no production cutover unless authorised) |

Section bundling rationale: brief §4 (Mode-state disclosure) and brief §5 (Agent surfaces) are cross-cutting concerns delivered alongside the authenticated surfaces in §3, not as standalone days.

Commit cadence: per section, signed by Operations Owner. PR title `feat: WorkCaptain customer-facing surface (v1)` opened on Day 2, kept open through Day 7.

### §6.1 Out-of-build deliverables (do NOT build per brief)
- Maqaleed Umbrella Dashboard (inheritance hooks only)
- Nafath/Absher integration (stub only — TODO marker)
- BNO cross-platform invitation flows (surface stub only)
- Crédito / Società / S2PPRO / MyVetCare surfaces (other platforms)
- Payment processing logic (backend / partner mediated)
- AI-SPM dashboards (Condition 3 — strictly internal)
- CERTUS Trust Ledger surfaces (WC outside CERTUS Trust Domain)
- Marketing-as-launched copy, viral loops, self-invite, public pricing self-checkout

---

## §7 · Binding-Rule Ambiguities Discovered

### §7.1 UX-G1 V1.1.1 ratification status
The IDE-opened spec excerpt declares V1.1.1 "RATIFIED 09 May 2026 by Sponsor Waheeb Ghassan Mahmoud" with "DL anchor TO BE ASSIGNED." The full `~/Downloads/UX-G1-TOKENS-V1_1_1_Reissue.docx` declares "V1.1.1 Reissue — Pre-Ratification (Authoritative for Sponsor Final Verdict)." **Resolution per Sponsor B1(c) "latest ratified on disk supersedes brief-stated version":** treat V1.1.1 as ratified (the IDE excerpt is authoritative for Claude Code per its own §authority chain text); proceed against V1.1.1 token contract. If the live DL register reflects different status, surface for re-alignment.

### §7.2 UX-G2-INV-001 V1.2 not found; V1.1 used
Brief §0.1 names V1.2 (Master Surface Contract Inventory); disk has V1.1 + Addendum A V1.1 + Phase 2 Cluster 3 V1.0. Per Sponsor B1(c) latest-on-disk rule: V1.1 is binding. The 86 obligations are authoritative per V1.1 §3.

### §7.3 Mode-D pricing during controlled beta
Brief §1 calls for "Pricing tier outline: SMB (S) / Mid-market (T) / Government (G). Indicative only — no payment collection during controlled beta." RM-001 §10.1 Mode-D categorical prohibition forbids contracting, invoicing, recognition, reporting. **Resolution:** present pricing tiers as Mode-D-framed indicative only (B-04 partial), explicit "Pricing indicative; final pricing applies post-activation" disclaimer, no checkout affordances, no payment-method capture.

### §7.4 Agent surfaces in WC controlled-beta v1
Brief §3.3 names "WorkCaptain Saudisation Advisor" agent recommendations. The existing [app/api/ai_router.js](/opt/prowork/app/api/ai_router.js) + [app/modules/ai/](/opt/prowork/app/modules/ai) + [app/modules/agents/](/opt/prowork/app/modules/agents) provide the substrate. **Assumption:** all in-window agent outputs are Mode-D advisory; HITL approval required; Three Hard Guardrails enforced visually. No autonomous regulated execution. No agent-driven policy-state mutation. No agent-triggered Mode-D→Mode-A activation. Confirm.

### §7.5 PDPL Article 19 (data portability)
UX-G2-INV-001 V1.1 §13 proposes P-07 (PDPL Article 19 right to data portability) as a future catalogue addition. Backend [pdpl_router.js](/opt/prowork/app/api/pdpl_router.js) already supports PORTABILITY DSR. **Resolution:** include Article 19 portability in the brief §6 data-export surface (it's already implementable backend-side); flag as voluntary uptake of the proposed P-07 catalogue gap.

### §7.6 BA-001 §11 Pattern B dual-brand
Sponsor B5 binds brand-variant capability on day one. Pattern B per UX-G2-INV-001 G-02 = "WorkCaptain ↔ Maqaleed Workforce." **Resolution:** `src/brand/workcaptain.ts` is the active variant; `src/brand/maqaleed-workforce.ts` config exists for parity but not deployed during the controlled-beta window.

### §7.7 Constitutional Launch Window prohibitions
WC-OPS-001 V1.0 §7 prohibits, during D-Day → D15+41:
- No BRD V2.0 content
- No Addendum J initiation
- No CSEC authoring
- No Addendum A V1.0 activation
- No adjacent platform sequencing
- No new governance addenda
- No architectural branching
- No DL consumption for non-substrate matters

**Compliance for this build:** PROPOSAL.md is operational substrate produced under brief authorisation; not a governance instrument. The build delivers UI on top of the ratified S36–S39 substrate; no new architecture; no Addendum A activation (UX-G2 V1.1 spec satisfied semantically, not by Addendum A intelligence-surface authoring).

---

## §8 · Backend Gaps and Proposed Handling

### §8.1 Confirmed backend coverage
The existing 30+ routers cover every customer-facing endpoint the brief implies. **No new backend authoring is in scope for this build.** Customer UI consumes via hand-written typed client wrappers (Sponsor B4).

### §8.2 Gaps identified and proposed handling
| Gap | Source | Proposed handling |
|---|---|---|
| Wathq CR validation | brief §2; current [employer_onboarding_router](/opt/prowork/app/api/employer_onboarding_router.js) accepts CR without external validation | **TODO marker in UI**; format validation only (10-digit numeric); backend ticket out-of-window |
| Nafath SSO | brief §2 + A-01 | **Stub button** disabled, "Coming soon" label |
| Bulk employee import (CSV) | brief §3.2 | Inspect [identity_eri_router](/opt/prowork/app/api/identity_eri_router.js) and [recruiting_router](/opt/prowork/app/api/recruiting_router.js) on Day 4; if no bulk endpoint, **stub UI** with TODO and offer one-by-one create as fallback |
| Payroll write endpoints | brief §3.4 | **Read-only UI** for WPS payroll runs per brief §3.4 sentence (write deferred) |
| Org admin invite additional users | brief §3.6 | [auth_router](/opt/prowork/app/api/auth_router.js) `/register` creates owner; sibling-user creation endpoint not confirmed. Inspect Day 4; if absent, **omit "invite team member" UI** and document as gap |
| Consent revocation per-grant | brief §6 | [pdpl_router](/opt/prowork/app/api/pdpl_router.js) supports DSR-level revocation; per-consent-grant revocation needs confirmation. Inspect Day 6; if endpoint absent, surface DSR-level revoke and TODO marker |
| AI-SPM exposure | brief OOS + MPC C3 | **Hard-coded UI guard**: any route or component name containing `aispm` is prohibited; verify via `grep` in Day 7 smoke test |

### §8.3 Backend tickets (out-of-window; for post-D15+41 planning, not for this build)
Wathq integration; Nafath SSO wiring; payroll write endpoints; sibling-user invite; per-consent-grant revoke; central customer-surface OpenAPI document.

---

## §9 · Risks and Mitigations

| Risk | Severity | Mitigation |
|---|---|---|
| Token migration regression in existing 1617-line CSS | Medium | Alias-bridge in styles/legacy-alias.css during Days 1–5; remove on D-1; verify via `npm run wcag:audit` daily |
| 7-day window too tight given existing UI scope (32 pages) | Medium | Brief §1–§6 prioritises a focused customer-facing subset; deeper pages preserved as-is until post-window |
| Agent surfaces (UX-001 §7) authoring under window prohibition on Addendum A | Low | Semantic compliance with UX-G2 V1.1 §5–§6 via vanilla components; no Addendum A intelligence-surface authoring |
| CI/CD AWS-GCP gap during deploy | Medium | Sponsor B3 explicitly OOS; document in DEPLOYMENT.md, manual `gcloud run deploy` for window |
| Brand variant infra adds churn before launch | Low | Sponsor B5 binds day-one config; minimal: two TS files + env-driven resolver |
| Token "WorkCaptain Admin" → "WorkCaptain" rename touches 5+ files | Low | Single batch grep + Edit on Day 1 |
| Existing custom Playfair Display violates G1 | Low | Remove on Day 1 along with token rename |

---

## §10 · Decision Surface (for Sponsor)

**Verdict:** ☐ Approve  ☐ Approve with amendments  ☐ Defer  ☐ Reject

**Reasoning request:** if Approve, this proposal authorises Day-1 execution against the §6 schedule. No product code is written until Sponsor entry above. If Approve with amendments, please specify which §1–§9 items require change; will revise and re-issue before Day-1 start.

**Specific points for Sponsor attention:**
1. §7.4 — confirm all in-window agent surfaces are Mode-D advisory; HITL required; no autonomous execution
2. §7.5 — confirm voluntary uptake of P-07 PDPL Article 19 portability surface (backend already supports)
3. §5.2 — confirm Playfair Display removal is acceptable (no replacement display font from canonical; existing display-font usage migrates to IBM Plex Sans weight semibold/bold)
4. §5.3 — confirm `--maq-wc-zone-*` namespace for Nitaqat colors as additive-on-canonical (rather than promoting to portfolio G1 amendment in-window)
5. §6 — confirm 7-day D-5 → D+2 schedule alignment (vs. attempting full delivery by D0)

---

## §11 · Authority and Signatories

**Sponsor:** Waheeb Ghassan Mahmoud (CEO + Sponsor)
**Date authored:** 2026-05-11 Jeddah, KSA
**Operational substrate basis:** Sponsor EX-D authorisation 2026-05-10 (per WC-OPS-001 V1.0); Sponsor controlled-beta build brief + decisions B1–B5 + B-extra + B-extra-2 (this session)
**Companion artefacts to be produced post-Approve:** DEPLOYMENT.md (after Day 6); TEST_PLAN.md (after Day 6)
**No new governance documents will be produced beyond these three.**

---

## §11 · Amendments (Sponsor verdict 2026-05-11 — APPROVE WITH AMENDMENTS)

Five amendments issued under Sponsor verdict. Binding from this point through D15+41 unless superseded.

### §11.A1 · Portfolio UI gap clause
This build is the FIRST remediation target of a portfolio-wide UI/UX execution gap, not a WorkCaptain-only effort. The portfolio has crossed the threshold where governance maturity exceeds UI maturity (six UX governance artefacts ratified in 13 days, zero customer-facing surfaces shipped). WorkCaptain is the leading-edge fix. The same execution pattern will extend to Crédito, Società, S2PPRO, and VetiCare in subsequent waves.

**How this shapes the build:** components are designed brand-neutral with config-driven brand overlays so the same primitives transplant to other platforms; see §11.A5.

### §11.A2 · No-more-documentation-loop clause
PROPOSAL.md (including this amendments appendix) is the **final planning artefact**. The next deliverables from this thread are code commits, DEPLOYMENT.md, and TEST_PLAN.md. No further proposals, no further surveys, no further review memos.

If a binding ambiguity surfaces during build: raise it inline in a commit message or a short message in this thread, state the default per stricter-interpretation rule (below), proceed. Do NOT produce another review document.

**Stricter-interpretation rule recap (binding in-window):**
- Ambiguous governance rule → more restrictive reading
- Two-ways feature → less surface area, less data exposure, less agent autonomy, more disclosure
- Mode A/D doubt → Mode D + advisory banner
- CERTUS doubt → non-CERTUS (WC is outside CERTUS per MA-001 §7.1)
- Controlled-beta vs GA doubt → controlled-beta copy/posture

### §11.A3 · End-to-end journey acceptance gate (Day 7 binding)
Day 7 deliverable is NOT "pages built" — it is "journey demonstrable end-to-end." A test user must complete:

1. Land on workcaptain.ai apex
2. Understand what WorkCaptain is in under 30 seconds
3. Request controlled-beta access (cohort registration)
4. Receive invitation, sign in
5. Complete first-time onboarding wizard
6. See dashboard with their org's data
7. Navigate to workforce/employees and perform one operation (add or view)
8. View Saudisation status with agent-attributed advice
9. View compliance/filing calendar
10. Access trust/audit-trail/consent surface
11. Encounter at least one failure state (empty / error / permission-denied) and continue without losing trust

TEST_PLAN.md scripts this journey. Build is not complete until journey runs cleanly in `prj-maq-workcaptain-nonprod`.

### §11.A4 · Feature-to-UI parity gate (NO PHANTOM FEATURES)
Every visible feature in the UI must map to an actual backend route in `app/api/`. Features without a working backend route receive one of two treatments:

- **(a)** Labelled "Coming later" with disabled state + one-sentence explanation; OR
- **(b)** Labelled "Unavailable in beta" with same treatment.

No buttons that do nothing. No tabs that open empty placeholders without explanation. If a feature cannot be honestly delivered to a beta user, it is **either functional or labelled** — never silently broken.

TEST_PLAN.md will include a **feature-to-route parity table** showing every UI feature, its backend route, its Mode (A or D), and its beta status.

### §11.A5 · Portfolio reuse rule
Every component, token, layout decision, and pattern made during this build must be reusable across Crédito, Società, S2PPRO, and VetiCare. Specifically:

1. **Components** in [app/frontend/src/components/](app/frontend/src/components/) consume canonical `@maqaleed/design-tokens` (locally replicated per B-extra) without WorkCaptain-specific hard-coding.
2. **Brand variant overlays** at [app/frontend/src/brand/](app/frontend/src/brand/) are the ONLY place WorkCaptain-specific content lives. Components are brand-neutral; they receive brand config as input.
3. **Portfolio-extraction candidates** (post-D15+41): cohort-registration page, sign-in flow, onboarding wizard, dashboard KPI grammar, agent-surface chip, trust-surface block, edge-state treatments.
4. **WC-specific decisions** that intentionally cannot be extracted carry a one-line comment explaining why, so future portfolio extraction work knows what to keep WC-only.

No new shared-package extraction during this build (per B-extra). Documenting reuse intent through code comments and clean component design is the deliverable.

---

**End of Proposal — APPROVED 2026-05-11 with five amendments. Day-1 execution proceeds.**
