# WorkCaptain Customer-Facing Surface — Test Plan

**Audience:** Sponsor or a beta-cohort member running the customer-facing surface end-to-end without engineering assistance.
**Branch:** `feat/wc-customer-surface-v1`
**Date:** 2026-05-16

This plan covers (a) the 11-step end-to-end journey acceptance gate (PROPOSAL §11.A3), (b) the feature-to-route parity table (§11.A4), (c) per-section smoke tests for every customer surface built across Days 1–6, (d) WCAG 2.2 AA audit instructions, (e) edge-state verification, and (f) Three Hard Guardrails verification on agent surfaces. Bilingual coverage (en + ar) is exercised throughout.

---

## §0 · Pre-test setup

```bash
# From the repo root
cd app/frontend
npm ci
npm run build
# Either:
#   (a) Preview locally
npx vite preview --port 4173
#   (b) Run dev server with backend proxy
cd .. && npm run dev:all   # spawns node app/server.js + Vite dev
```

**Browser:** Chromium-based (Chrome 120+ / Edge 120+) recommended for WCAG audit + manual run. Tested viewport: desktop 1280×800.

**Backend assumption:** `app/server.js` on `localhost:3010` is reachable. The customer surface proxies `/api/*` to that origin during dev. For preview-only static testing, the cohort form submission will fail at the network boundary; all other front-end behaviour is testable from the static build alone.

---

## §1 · 11-step end-to-end journey (PROPOSAL §11.A3 acceptance gate)

Run this in **both English and Arabic** locales. Toggle locale from the header before each step.

| # | Action | Expected behaviour | Pass criterion |
|---|---|---|---|
| 1 | Open `http://localhost:4173/` | Controlled-beta banner at top; header with "WorkCaptain" wordmark + language toggle; commercial hero (title + lede covering Saudisation, payroll, GOSI, Mudad, Qiwa, workforce analytics, HR record-keeping); trust band (4 items); 5 capability cards; pricing outline; footer. | Page renders within 2 s. No console errors. |
| 2 | Read hero | One-sentence understanding of what WorkCaptain is in <30 seconds. | Lede explicitly lists the HR service portfolio. |
| 3 | Click **Request access** | Navigates to `/app.html#request-access` cohort intake form (org name / CR / contact / email / phone / primary use case / team size / locale). | Form renders. Submit posts to `POST /api/cohort/request`; success screen returns reference id. **NO account is auto-created.** |
| 4 | Sponsor manually issues invitation (out-of-band via `POST /api/invitations`); recipient clicks invite link → `/app.html#accept-invite?token=…` → sets password → redirected to dashboard. Then **Sign out** → return to `/app.html#signin` → email + password. | Token is one-shot; tenant + owner user created on accept. JWT issued on signin. | `/app.html#dashboard` reachable post-signin. |
| 5 | First-time onboarding wizard (`/app.html#onboarding`) | 5 fields only (org name, CR format-only, primary use case, team size, locale) + PDPL consent checkbox. Submit → advances to `/app.html#beta-acknowledgement`. | Wizard is lean (no activity_code, region, saudi_employees from prior S40-G5 schema). Consent checkbox required. |
| 6 | View dashboard (`/app.html#dashboard`) | 4 KPI cards: Saudisation rate · Employees · Pending filings · Compliance status. Each carries a Mode-D chip. Empty states show action CTA for new tenants. Mode-D advisory banner under grid. | KPIs load from `/api/compliance/dashboard/summary`. No "Apply automatically" CTAs anywhere. |
| 7 | Navigate to **Employees** (`/app.html#employees`) | Worker list (from `/api/identity/workers`) with search filter. Click a row → detail panel (profile + ERI + employer-summary). Add / Edit / Import-CSV buttons are **disabled** with "Coming later" badge. | Read-only flow functional. No write buttons enabled. |
| 8 | Navigate to **Saudisation** (`/app.html#saudisation`) | Nitaqat zone + Saudisation rate + Saudi/Total KPIs. **Three Hard Guardrails** info banner explicit at section top (no autonomous regulated execution; no policy-state modification; no activation of deferred capabilities). Saudisation Advisor section composes: AgentAttributionMarker · ConfidenceBand (qualitative only unless backend emits calibrated) · ExplainabilityBundle · SourceCitation · AuditTrailLink · HITLPromptCard. Approve / Modify / Reject buttons explicit. | No "Apply automatically" affordance. Approve posts to `POST /api/admin/ai/audit-log/:id/decision`. Escape key on HITL card defaults to non-destructive Reject. |
| 9 | Navigate to **Compliance** (`/app.html#compliance`) | Filing calendar (GOSI / Qiwa / Mudad). Synthetic reminders flagged with ⚙ icon when backend has no structured calendar. Reminders config labelled "Coming later". | Calendar derives from `/api/compliance/dashboard/summary`. |
| 10 | Navigate to **Trust** (`/app.html#trust`) | 4 tabs: Audit trail · Consent · Data export · Residency. Audit trail merges AI audit log + evidence access. Consent shows current PDPL grant; Revoke button disabled "Coming later"; DSR form for 6 PDPL types. Data export uses queued-action chip (bottom-right; queued→succeeded/failed states). Residency states KSA in-Kingdom + explicit "What we do not claim" (no SAMA cert, no NCA ECC, no ISO 27001, no SOC 2). | All four tabs render. DSR submit hits `POST /api/compliance/pdpl/dsr`. Export click queues. |
| 11 | Force a failure state: turn off Wi-Fi / disconnect backend → reload dashboard, attempt an export | Edge-state primitives surface: skeleton loader during request; error card with bilingual actionable message + correlation ID + retry; permission-denied state on 403 (no system leakage); queued-action chip shows retry/dismiss on network failure. **User trust preserved — no silent failures, no lost input.** | Per brief §7 + §8: every list/view/form has empty / loading / error / permission-denied / service-unavailable states. |

**Acceptance gate:** all 11 steps pass in **both en and ar**. Recorded outcome below (Sponsor fills in during personal walkthrough):

| Step | en pass | ar pass | Notes |
|---|---|---|---|
| 1 | ☐ | ☐ | |
| 2 | ☐ | ☐ | |
| 3 | ☐ | ☐ | |
| 4 | ☐ | ☐ | |
| 5 | ☐ | ☐ | |
| 6 | ☐ | ☐ | |
| 7 | ☐ | ☐ | |
| 8 | ☐ | ☐ | |
| 9 | ☐ | ☐ | |
| 10 | ☐ | ☐ | |
| 11 | ☐ | ☐ | |

---

## §2 · Feature-to-route parity table (PROPOSAL §11.A4 — NO PHANTOM FEATURES)

Every visible feature maps to a real backend route OR is labelled "Coming later" / "Unavailable in beta" with disabled controls. Audit this on every surface visit.

| Surface | Feature | Backend route | Mode | Beta status |
|---|---|---|---|---|
| Landing `/` | Hero CTA — Request access | `POST /api/cohort/request` | D | functional |
| Landing `/` | Hero CTA — Sign in | `POST /api/auth/login` (via SPA `/app.html#signin`) | D | functional |
| Landing `/` | Feature card chips | — | D | display-only |
| Landing `/` | Pricing tiers | — | D | indicative only, no checkout |
| Landing `/` | Trust band PDPL / residency / HRSD-Qiwa-GOSI / audit-trail items | static + Cloud Blueprint v2.1 citations | n/a | functional |
| `/app.html#request-access` | Cohort intake form | `POST /api/cohort/request` (cohort_router.js) | D | functional |
| `/app.html#signin` | Email + password sign-in | `POST /api/auth/login` | D | functional |
| `/app.html#signin` | Nafath sign-in button | — | n/a | **disabled** "Coming soon" |
| `/app.html#register` | (Self-serve registration) | — | n/a | **redirect-only stub** → `/app.html#request-access` |
| `/app.html#accept-invite` | Invitation redeem + password set | `POST /api/invitations/accept` | n/a | functional |
| `/app.html#onboarding` | Lean wizard (5 fields + PDPL consent) | `PATCH /api/onboarding/profile` | D | functional |
| `/app.html#beta-acknowledgement` | One-time controlled-beta posture screen | localStorage-gated | n/a | functional |
| `/app.html#dashboard` | KPI cards × 4 | `GET /api/compliance/dashboard/summary` (fallback `/api/admin/dashboard/kpi`) | D | functional |
| `/app.html#employees` | Worker list | `GET /api/identity/workers` | D | functional |
| `/app.html#employees` | Worker detail | `GET /api/identity/:id/{profile,eri,employer-summary}` | D | functional |
| `/app.html#employees` | Add / Edit / Import CSV | — | D | **disabled** "Coming later" |
| `/app.html#saudisation` | Nitaqat status | `GET /api/compliance/dashboard/nitaqat` | D | functional |
| `/app.html#saudisation` | Advisor recommendations | `GET /api/admin/ai/audit-log` (filtered) | D | functional |
| `/app.html#saudisation` | Advisor Approve / Modify / Reject | `POST /api/admin/ai/audit-log/:id/decision` | D | functional |
| `/app.html#payroll` | WPS readiness pack | `GET /api/onboarding/wps/:pack_id` | D | functional (when pack_id known) |
| `/app.html#payroll` | Payroll runs list | — | D | **empty-state** "Coming later" |
| `/app.html#payroll` | Pay-now / payment selectors | — | D | **none rendered** (RM-001 §10.1 binding) |
| `/app.html#compliance` | Filing calendar | `GET /api/compliance/dashboard/summary` | D | functional (synthetic reminders flagged ⚙) |
| `/app.html#compliance` | Reminders config | — | D | **disabled** "Coming later" |
| `/app.html#trust` (Audit tab) | Audit trail | `GET /api/admin/ai/audit-log` + `/api/evidence/audit` | n/a | functional |
| `/app.html#trust` (Audit tab) | Data-changes filter | — | n/a | "Coming later" (VERITAS operator-scope) |
| `/app.html#trust` (Consent tab) | Current consents | derived from `/api/onboarding/status` | n/a | functional |
| `/app.html#trust` (Consent tab) | Per-consent revoke | — | n/a | **disabled** "Coming later"; DSR ERASURE is the real path |
| `/app.html#trust` (Consent tab) | DSR submit / list | `POST /api/compliance/pdpl/dsr` · `GET /api/compliance/pdpl/dsr` | n/a | functional |
| `/app.html#trust` (Export tab) | Pack list | `GET /api/evidence/packs` | n/a | functional |
| `/app.html#trust` (Export tab) | Download ZIP | `POST /api/evidence/packs/:id/export` (queued) | n/a | functional |
| `/app.html#trust` (Residency tab) | KSA region statement | static + Cloud Blueprint v2.1 | n/a | functional |
| `/app.html#trust` (Residency tab) | "What we do not claim" | static (SAMA / NCA ECC / ISO 27001 / SOC 2 non-claims) | n/a | functional |
| `/app.html#settings` (Profile) | Org profile read | `GET /api/onboarding/status` | n/a | functional |
| `/app.html#settings` (Profile) | Edit profile | link → `/app.html#onboarding` | n/a | functional |
| `/app.html#settings` (Users) | List + invite + revoke | `GET/POST/DELETE /api/invitations` | n/a | functional |
| `/app.html#settings` (Language) | Locale toggle + persist | `PATCH /api/onboarding/profile` + `setLocale()` | n/a | functional |
| `/app.html#settings` (Notifications) | Preferences | — | n/a | **disabled** "Coming later" |
| `/app.html#settings` (Billing) | Subscription / payment | — | D | **explicit** "Unavailable in beta" (Mode-D framed) |

**Acceptance:** every row above is either `functional` OR has a UI label visible to the user explaining its current state. **Zero phantom buttons / dead tabs / silent broken links.**

---

## §3 · Per-surface manual smoke tests

### §3.1 Apex landing `/`

1. Load `/` — page renders with controlled-beta banner, header (wordmark + language toggle), commercial hero, trust band, feature cards, pricing outline, footer.
2. **Language toggle** — click toggle (top right). Page re-renders in Arabic; `<html dir>` becomes `rtl`. Toggle back to English; `dir` becomes `ltr`. Toggle state persists across page reloads.
3. **Trust band** — 4 items: 🛡 PDPL · 📍 KSA / me-central2 / Dammam · 🤝 HRSD / Qiwa / GOSI integration via licensed partners · 📜 Full audit trail, consent, data export visible to admin. Disclaimer beneath redirects to Trust › Residency for honest non-claims.
4. **Feature cards** — 5 cards visible: Saudisation OS · Payroll · Workforce Analytics · Record-keeping · Government workforce. Each carries a Mode-D chip showing "Available · advisory only". Government workforce card additionally shows the "Informational only — cohort enrolment not yet open." note. **No internal codes (WC-SAUD etc.) visible to the user.**
5. **Pricing outline** — 3 tier cards (SMB / Mid-market / Government). Mode-D disclaimer at top of section. **No "Buy now" / "Subscribe" buttons anywhere.**
6. **Robots posture** — view `/robots.txt`; confirm `User-agent: * \n Disallow: /`. View page source; confirm `<meta name="robots" content="noindex,nofollow,…">`.

### §3.2 Cohort intake `/app.html#request-access`

1. Submit with missing org name → error message in active locale, no network request fired.
2. Submit with invalid CR (e.g., `12345`) → "CR number must be 10 digits" error.
3. Submit with valid 10-digit CR + valid email + phone + use case + team size → success receipt with reference id; no JWT issued; no account created.
4. Submit a second request with the same email → server returns 409 DUPLICATE_REQUEST → bilingual "request already pending review" message.

### §3.3 Sign-in `/app.html#signin`

1. Submit empty email → error "Email is required".
2. Submit invalid credentials → error "Invalid email or password."
3. **Nafath button** present below the email/password form, **disabled** with "Coming soon" badge. Click does nothing (cursor `not-allowed`).
4. Successful sign-in → JWT stored at `localStorage.pw_token`; navigation to `/app.html#dashboard`.

### §3.4 Onboarding `/app.html#onboarding`

1. 5 form fields render (org name / CR format-only / primary use case / team size / locale).
2. PDPL consent checkbox present; submitting without checking yields error "PDPL consent is required to continue."
3. Successful submit → tenant config updated (`establishment_name`, `total_employees`, `cr_number`, `primary_use_case`, `preferred_locale`, `pdpl_consent`) → redirect to `/app.html#beta-acknowledgement`.

### §3.5 Beta acknowledgement `/app.html#beta-acknowledgement`

1. Plain-language posture explanation + 4-bullet allowed-scope list + feedback channel.
2. "I understand" button stores `pw_cb_acknowledged_at` timestamp → redirect to dashboard.
3. Direct-link revisit after acknowledgement skips the screen → dashboard.

### §3.6 Dashboard `/app.html#dashboard`

1. Loading skeleton on first paint (4 placeholder cards).
2. KPI grid resolves: Saudisation rate · Employees · Pending filings · Compliance status. Each card has a Mode-D chip showing "Available · advisory only" (or "Mode D" abbreviation depending on locale).
3. New-tenant state shows empty-state per card with action CTA (e.g., "Add employees" → `/app.html#employees`).
4. Visibility-aware auto-refresh every 60 s (no refresh when tab is hidden).
5. 403 / FORBIDDEN response → renders permission-denied state with no leaked system info.

### §3.7 Employees `/app.html#employees`

1. List loads via `/api/identity/workers`. Search filter narrows by name / id substring.
2. Click row → detail panel loads parallel ERI + profile + employer-summary; partial failures show "—" rather than crash.
3. Add / Edit / Import-CSV buttons disabled with "Coming later" badge.

### §3.8 Saudisation `/app.html#saudisation`

1. Nitaqat zone pill colour matches WC zone palette token.
2. Saudisation rate KPI ratio variant; Saudi/Total count variant.
3. **Three Hard Guardrails banner** at top: bullets for "No autonomous regulated execution" / "No agent-driven policy-state modification" / "No activation of deferred capabilities via this surface."
4. **Advisor recommendation card:** AgentAttributionMarker chip on card; ConfidenceBand (qualitative only — Low/Moderate/High — unless backend supplies `calibrated:true`); ExplainabilityBundle with Layer 1 / Layer 2 details / Layer 3 audit trail link; SourceCitation chips for input signals.
5. **Approve / Modify / Reject** buttons explicit. **Modify** requires rationale (≥10 chars) before commit. **Reject** requires rationale. Escape key defaults to non-destructive Reject.
6. **No "Apply automatically" affordance anywhere on the surface.**
7. Each card carries the italicised "Approve or reject the advisor's recommendation manually…" note beneath the HITLPromptCard.

### §3.9 Payroll `/app.html#payroll`

1. Read-only banner at top: explicit "Payroll execution is partner-mediated via licensed WPS providers. No payment is initiated from this surface."
2. WPS readiness pack details render (Pack ID · Establishment IBAN **masked** to `XXXX •••• YYYY` · Generated · Status · Employees).
3. Payroll runs section labelled "Coming later"; empty-state explains source-of-truth is the bank's WPS dashboard.
4. **No "Pay now" / payment selectors anywhere.**

### §3.10 Compliance `/app.html#compliance`

1. Filing calendar lists GOSI / Qiwa / Mudad entries with authority badge, title, due date, status pill.
2. Synthetic items (those derived because backend has no structured filings) carry a ⚙ icon with tooltip "Derived reminder — source-of-truth lives in the upstream authority's portal".
3. Reminders configuration section labelled "Coming later" (dashed border, 🚧 placeholder).

### §3.11 Trust `/app.html#trust`

**Audit tab:**
1. Chronological list with newest first.
2. Type chips (Agent action / Human approval / Evidence access) colour-coded per event type.
3. Each row carries timestamp + correlation ID. Confidence band visible where the entry carries a numeric score.
4. "Data changes" filter note explains operator-scope and Coming-later position.

**Consent tab:**
1. Current PDPL consent shown with grant date and version.
2. Revoke button **disabled** with "Coming later" tooltip pointing to DSR-ERASURE.
3. DSR submission form: 6 types selectable (ACCESS / RECTIFICATION / ERASURE / PORTABILITY / OBJECTION / RESTRICTION); description ≥5 chars required.
4. DSR history list populated after submission.

**Data export tab:**
1. Evidence pack list with hash prefix shown.
2. Click "Download ZIP" → queue indicator chip appears bottom-right ("Queued — sending…").
3. On success, chip transitions to "Sent ✓" and clears after 3 s. Browser triggers ZIP download.
4. On simulated network failure, chip transitions to "Failed" with manual **Retry** + **Dismiss** buttons.

**Residency tab:**
1. In-Kingdom card: "Your data is stored in Saudi Arabia — Google Cloud me-central2 (Dammam) region." Cloud Blueprint v2.1 citation.
2. **"What we do not claim"** block visible with the 3 honest non-claims (NCA ECC cert / SAMA licence / ISO 27001+SOC 2).

### §3.12 Settings `/app.html#settings`

1. Five tabs: Organisation / Users / Language / Notifications (Beta) / Billing (Beta).
2. **Organisation** — read-only profile fields; "Edit profile" link routes to `/app.html#onboarding`.
3. **Users** — invite form (email + role); list pending / accepted / revoked invitations.
4. **Language** — radio toggle; selection persists to backend (`PATCH /api/onboarding/profile`) and localStorage.
5. **Notifications** — "Coming later" placeholder; no preference toggles rendered.
6. **Billing** — "Unavailable in beta" card with Mode-D chip; no payment selectors.

---

## §4 · WCAG 2.2 AA audit (blocking)

```bash
# Prerequisites: vite preview running on :4173 (see §0).
cd /opt/prowork
npm run wcag:audit
# Exit 0 = pass (0 critical/serious violations). Exit 1 = fail.
# Reports written to reports/accessibility/audit-<ts>.{json,txt}.
```

**Audit script fixes shipped in `feat/wc-customer-surface-v1`:**

| Fix | Commit |
|---|---|
| `.configure()` → `.options()` (rules-array contract) | `cd49ba3` |
| `pw_token` localStorage key (auth bypass for protected routes) | `cd49ba3` |
| Removed invalid `focus-visible` rule; tag-based filter only | `83d3664` |
| Landing colour-contrast: hero fine-print, mode-D chip, feature-card note, pricing disclaimer | `106a6f6` |
| 4 walkthrough findings (commercial hero, CTAs, trust band, hide codes) | `9bc9505` |

**Expected post-fix outcome:** 0 critical / 0 serious violations across the 9 audited routes.

---

## §5 · Edge-state verification (brief §7)

For every list / view / form, verify these states render via the shared `components/edge_state.js` primitives:

- **Loading.** Reload the page after disabling network throttling → skeleton or spinner appears within 100 ms. No blank-screen flicker.
- **Empty.** On a brand-new tenant with no employees → KPI cards + employees + saudisation + compliance show structured empty state with action CTA explaining how to populate.
- **Error.** Stop the backend (`pkill -f 'node app/server.js'`) → reload a data-bearing page → error card surfaces with: bilingual title + actionable message + correlation ID + Retry button.
- **Permission denied.** Sign in as a low-privilege user → visit Settings › Users → permission-denied state renders ("You don't have access to this view") with no system structure leaked.
- **Service unavailable.** Force a 503 from the backend → service-unavailable banner with optional status-page link.

---

## §6 · Three Hard Guardrails verification (MA-001 §3 Invariant 2)

On every agent-bearing surface (currently `/app.html#saudisation`), confirm visually and by interaction:

1. **No autonomous regulated execution.** No "Apply automatically" / "Auto-approve" / "Schedule" buttons. Every Approve requires explicit human click.
2. **No agent-driven policy-state modification.** Backend audit log records ONLY the human decision; downstream effects (if any) are backend-mediated. Network tab on browser dev-tools confirms no surface-level state-mutation POSTs are fired.
3. **No activation of deferred capabilities via this surface.** Mode-A activation is not exposed; all capabilities show Mode-D chip; clicking a Mode-D chip yields no Mode-A toggle.

Banner at top of Saudisation page lists these three guardrails verbatim in both locales.

---

## §7 · Bilingual coverage (brief §1 + §I)

Toggle to Arabic locale once and re-walk §1 (the 11-step journey). Specifically verify:

- `<html dir="rtl">` set; full page flips inline-axis (margins, padding, alignment).
- All component labels translate (no untranslated en-only fallback visible).
- Currency symbols render trailing per Arabic convention (KPI cards, pricing).
- Hijri date not exposed where Gregorian was expected (no auto-conversion).
- Logical-property CSS holds: no `left:` / `right:` / `margin-left:` / `margin-right:` artifacts.

---

## §8 · Sign-off

| Check | Status |
|---|---|
| 11-step journey en | ☐ |
| 11-step journey ar | ☐ |
| Feature-to-route parity (§2) | ☐ |
| WCAG 2.2 AA audit — 0 violations | ☐ |
| Edge states across all surfaces | ☐ |
| Three Hard Guardrails visible on Saudisation | ☐ |
| Bilingual coverage | ☐ |

**Sponsor signature:**
**Operations Owner signature:**

**End of TEST_PLAN.md.**
