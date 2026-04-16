# WORKCAPTAIN — SOVEREIGN ACTIVATION RECOVERY EXECUTION PLAN

```
Document:       SOVEREIGN_ACTIVATION_RUNWAY.md
Path:           /PROWORK_ROOT/EXECUTION/RECOVERY/SOVEREIGN_ACTIVATION_RUNWAY.md
Version:        1.0
Applies From:   Sprint S36
Status:         ACTIVE — EXECUTE IN SEQUENCE
Source BRD:     Gold BRD (Section A binding), WOS Addendum, RT-1 Addendum,
                Consolidated Features Addendum, Maqaleed Evaluation (April 2026)
Post-Baseline:  S32–S35 CLOSED (all 28 gates PASS)
Authority:      Waheeb Mahmoud
```

---

## EXECUTION PROTOCOL

Each gate below is a **self-contained Claude Code block**. Rules:

1. Execute gates in order within each sprint. Do not skip.
2. Run the **EVIDENCE COMMAND** after every gate. Attach output to Notion before advancing.
3. No gate advances to DONE without evidence attached.
4. No AI tool may auto-close any gate. Human closure only.
5. S36-G2 (RBAC Freeze equivalent) — no schema changes after gate closure.
6. S39-G7 is CEO Exit — human-only approval required.

---

## SPRINT S36 — SOVEREIGN CORE + AI GOVERNANCE UI

```
Sprint:    S36
Objective: Deploy AI governance surface and KSA sovereign recruiting layer
Gates:     S36-G1 through S36-G7
BRD Refs:  Gold BRD A4, WOS §7.1–7.2, WOS §11.2–11.3, RT-1 §5.2
```

---

### S36-G1 — AI Governance: Logging Pipeline + Audit Schema

```
GATE ID:   S36-G1
BRD REF:   Gold BRD A4, WOS §11.3, RT-1 §8.2
STATUS:    OPEN
```

**Claude Code Prompt — paste exactly:**

```
Activate Project Master Mode.
Reference: Gold BRD A4, WOS §11.3, RT-1 §8.2.

BASELINE:
AI recommendations exist in the system but outputs are not logged with
required schema fields (prompt, context references, model version, output,
reviewer decision). No immutable audit trail is active.

TARGET:
Implement a complete AI governance logging pipeline:

1. Create /src/services/ai/auditLog.ts
   - RecommendationAuditLog schema with fields:
     id (uuid), timestamp (UTC, immutable), actor (userId),
     actionType (RECOMMENDATION | MATCH | COMPLIANCE_HINT | SUMMARY | RISK_SCORE),
     inputSignals (jsonb), rationale (text), confidenceScore (0.00–1.00),
     modelVersion (string), promptHash (sha256), outputSnapshot (jsonb),
     reviewerDecision (ACCEPTED | REJECTED | OVERRIDDEN | PENDING),
     reviewerId (uuid nullable), reviewedAt (timestamp nullable),
     overrideReason (text nullable), biasScore (0.00–1.00 nullable),
     tenantId (uuid), immutableHash (sha256 of all fields)
   - write() method — append-only, no update/delete permitted
   - export() method — returns structured JSON for regulator download
   - computeImmutableHash() — SHA-256 of all fields except immutableHash itself

2. Create /src/db/migrations/YYYYMMDD_create_recommendation_audit_log.sql
   - Table: recommendation_audit_logs
   - All fields above with correct types
   - Composite index on (tenantId, timestamp DESC)
   - Index on (reviewerDecision) for pending queue
   - ROW LEVEL SECURITY enabled — tenant isolation enforced
   - No DELETE permissions on this table for any role

3. Create /src/services/ai/biasMonitor.ts
   - computeBiasScore(signals: InputSignals): number
   - Flag if nationality, gender, or age signals are primary drivers
   - Log bias score in every RecommendationAuditLog entry

4. Update all existing AI service calls to pass through auditLog.write()
   - Talent matching service
   - Compliance copilot service
   - Risk scoring service

CONSTRAINTS:
- Table must be append-only at database level (no UPDATE/DELETE grants)
- immutableHash must be verified on every read
- Bias monitoring must not block recommendation — log and flag only
- Tenant isolation via RLS is mandatory, not optional

EVIDENCE COMMANDS:
npm run test:ai-audit-log
psql -c "SELECT COUNT(*) FROM recommendation_audit_logs WHERE immutableHash IS NULL;"
# Expected: 0 rows with null hash
psql -c "\dp recommendation_audit_logs"
# Expected: no DELETE or UPDATE privileges for application role

DELIVER:
- /src/services/ai/auditLog.ts (full file content)
- /src/services/ai/biasMonitor.ts (full file content)
- /src/db/migrations/YYYYMMDD_create_recommendation_audit_log.sql (full content)
- /src/tests/ai/auditLog.test.ts — minimum 12 test cases including:
  immutability enforcement, hash verification, tenant isolation,
  bias score logging, export format correctness
```

**Evidence Required for Gate Closure:**
```bash
npm run test:ai-audit-log -- --coverage
# Attach: coverage report screenshot + all tests PASS

psql -c "SELECT column_name, data_type FROM information_schema.columns
         WHERE table_name = 'recommendation_audit_logs' ORDER BY ordinal_position;"
# Attach: full schema output

psql -c "SELECT grantee, privilege_type FROM information_schema.role_table_grants
         WHERE table_name = 'recommendation_audit_logs';"
# Attach: confirm no DELETE/UPDATE grants exist
```

---

### S36-G2 — AI Governance: /ai Control Screen (RecommendationAuditLog Surface)

```
GATE ID:   S36-G2
BRD REF:   Gold BRD A4, RT-1 §5.2, WOS §11.2
STATUS:    OPEN
RBAC NOTE: Schema from S36-G1 is frozen from this point — no schema changes
```

**Claude Code Prompt — paste exactly:**

```
Activate Project Master Mode.
Reference: Gold BRD A4, RT-1 §5.2, WOS §11.2.
Dependency: S36-G1 must be CLOSED before executing this gate.

BASELINE:
No /ai screen exists. AI recommendations are made but not visible,
explainable, or approvable in the product UI. Enterprise and regulatory
audiences cannot inspect AI decisions.

TARGET:
Build the /ai Control Screen — the AI governance command surface:

1. Create /src/pages/ai/AIControlScreen.tsx
   Route: /ai
   Layout: Command Center shell (consistent with platform navigation)

   SECTIONS:
   A. Activity Feed (top — full width)
      - Real-time list of recommendation_audit_logs, newest first
      - Each row: action type badge, confidence score bar (0–100%),
        reviewer decision badge (PENDING=amber, ACCEPTED=green,
        REJECTED=red, OVERRIDDEN=orange), timestamp (relative + absolute),
        actor identity, expand chevron
      - Expand: shows inputSignals JSON viewer, rationale text,
        modelVersion, promptHash (truncated), biasScore indicator
      - Filter bar: by actionType, reviewerDecision, dateRange, tenantId (admin only)
      - Pagination: 25 rows per page

   B. Explainability Panel (slide-in from right on row click)
      - Full recommendation detail
      - Input signals — human-readable labels (not raw keys):
        "Skills match: 87%", "Prior delivery: 12 projects", etc.
      - Confidence score — visual gauge with interpretation label
      - Alternative compositions (if available in log)
      - Bias score indicator — green/amber/red with explanation
      - APPROVE button → sets reviewerDecision=ACCEPTED, logs reviewerId + reviewedAt
      - REJECT button → requires rejectionReason text (min 10 chars) before confirm
      - OVERRIDE button → requires overrideReason + confirms to OVERRIDDEN state

   C. Pending Approvals Queue (sidebar or tab)
      - Filtered view: reviewerDecision=PENDING only
      - Sorted by timestamp ASC (oldest pending first)
      - Bulk approve capability for low-risk (confidenceScore >= 0.85) recommendations
      - Count badge in navigation

   D. Export Controls (bottom bar)
      - "Export audit log" button → downloads JSON (structured, regulator-ready)
      - Date range picker + format selector (JSON / CSV)
      - Export is logged as a system action in the audit log

2. Create /src/components/ai/ExplainabilityCard.tsx
   - Reusable component — used in /ai screen AND inline in other screens
   - Props: auditLogEntry, onApprove, onReject, onOverride, readonly?

3. Create /src/components/ai/ConfidenceGauge.tsx
   - Visual gauge: 0–100%, color-coded (red <50%, amber 50–74%, green >=75%)
   - Accessible: aria-label with exact percentage

4. Wire pending count to navigation badge
   - Navigation item "/ai" shows red badge with pending count

CONSTRAINTS:
- AI must NEVER auto-approve — all approve/reject actions require explicit human click
- Reject and override require reason text — form validation enforced
- Export must be logged in recommendation_audit_logs as a SYSTEM action
- All approval actions must be atomic (optimistic UI with rollback on failure)
- Accessibility: all interactive elements keyboard-navigable, focus rings visible

EVIDENCE COMMANDS:
npm run test:ai-control-screen
npm run test:accessibility -- --page=/ai
# Must report 0 critical WCAG 2.2 violations

DELIVER:
- /src/pages/ai/AIControlScreen.tsx (full file content)
- /src/components/ai/ExplainabilityCard.tsx (full file content)
- /src/components/ai/ConfidenceGauge.tsx (full file content)
- /src/tests/ai/AIControlScreen.test.tsx — minimum 15 test cases
- Accessibility audit report for /ai page
```

**Evidence Required for Gate Closure:**
```bash
npm run test:ai-control-screen -- --coverage
# Attach: all tests PASS

npm run test:accessibility -- --page=/ai --standard=WCAG22AA
# Attach: 0 critical violations confirmed

# Manual: demonstrate approve + reject flows with reason validation
# Attach: screen recording or screenshot sequence
```

---

### S36-G3 — Nitaqat Impact Preview

```
GATE ID:   S36-G3
BRD REF:   WOS §7.1, WorkCaptain Eval §7.1
STATUS:    OPEN
```

**Claude Code Prompt — paste exactly:**

```
Activate Project Master Mode.
Reference: WOS §7.1, WorkCaptain Eval §7.1 (P0 sovereign module).

BASELINE:
No Nitaqat Impact Preview exists anywhere in the product. Employers have
no visibility into how a candidate hire will affect their Nitaqat zone.
This is the platform's primary KSA differentiator.

TARGET:
Implement Nitaqat Impact Preview as a first-class feature:

1. Create /src/services/compliance/nitaqat.ts
   - NitaqatPolicyEngine class
   - calculateImpact(params: NitaqatParams): NitaqatImpactResult
     Params: {
       establishmentProfile: { saudiCount, totalCount, activityCode, region },
       candidateNationality: string,
       roleCategory: OccupationCategory,
       contractType: 'FTE' | 'FREELANCER',
       proposedSalary: number
     }
     Result: {
       currentZone: 'PLATINUM' | 'HIGH_GREEN' | 'MEDIUM_GREEN' | 'LOW_GREEN' | 'YELLOW' | 'RED',
       projectedZone: same,
       saudiPercentageBefore: number,
       saudiPercentageAfter: number,
       confidenceBand: { low: ZoneType, high: ZoneType },
       influencingFactors: InfluencingFactor[],
       explanation: string (Arabic + English)
     }
   - getPolicyVersion(): string — returns current policy version
   - All policy constants configurable via environment / policy config,
     NOT hardcoded. Policy rules are versioned assets.

2. Create /src/db/migrations/YYYYMMDD_create_nitaqat_overrides.sql
   - Table: nitaqat_preview_overrides
   - Fields: id, candidateId, originalParams (jsonb), overriddenParams (jsonb),
     overriddenBy (userId), reason, timestamp, evidencePackId
   - All overrides logged — immutable record

3. Create /src/components/compliance/NitaqatImpactPreview.tsx
   - Embeds in: candidate profile view, offer builder, requisition screen
   - Displays:
     Current zone badge (color-coded: Platinum=gold, High Green=green,
     Medium/Low Green=light-green, Yellow=amber, Red=red)
     Arrow → Projected zone badge (with animation on change)
     Saudi % before → after (e.g., "31.2% → 32.8%")
     Confidence band (e.g., "Likely Green, possible Platinum")
     Influencing factors list: which attributes drove the impact
     Full Arabic explanation text (RTL layout)
   - "Override inputs" button → opens parameter override form
   - All overrides require reason and are logged to nitaqat_preview_overrides
   - Loading skeleton while calculation runs

4. Create /src/api/compliance/nitaqat.ts (API route)
   - POST /api/compliance/nitaqat/preview
   - Validates input params
   - Calls NitaqatPolicyEngine
   - Logs the preview action (not an override — just a view event)
   - Returns NitaqatImpactResult

CONSTRAINTS:
- Policy rules must be configurable, not hardcoded (regulatory updates must not
  require code deploys)
- Override inputs must log to evidence — HR override of Nitaqat parameters
  is an auditable action
- Arabic explanation is mandatory for every result (not optional)
- Confidence band must always be shown — never present a single-point projection

EVIDENCE COMMANDS:
npm run test:nitaqat-policy-engine
# Must cover: each zone transition, confidence band calculation,
# override logging, policy version retrieval

DELIVER:
- /src/services/compliance/nitaqat.ts (full file content)
- /src/components/compliance/NitaqatImpactPreview.tsx (full file content)
- /src/api/compliance/nitaqat.ts (full file content)
- /src/db/migrations/YYYYMMDD_create_nitaqat_overrides.sql
- /src/config/compliance/nitaqat-policy-v1.json — policy constants file
- /src/tests/compliance/nitaqat.test.ts — minimum 20 test cases
```

**Evidence Required for Gate Closure:**
```bash
npm run test:nitaqat-policy-engine -- --coverage
# Attach: all 20+ tests PASS, coverage >= 90%

# Manual: demonstrate zone preview on candidate profile
# Attach: screenshot showing current zone → projected zone with Arabic text
```

---

### S36-G4 — Occupation Code AI Matching + Validation

```
GATE ID:   S36-G4
BRD REF:   WOS §7.2
STATUS:    OPEN
```

**Claude Code Prompt — paste exactly:**

```
Activate Project Master Mode.
Reference: WOS §7.2.
Dependency: S36-G1 must be CLOSED (occupation code suggestions logged via auditLog).

BASELINE:
No occupation code validation exists. No AI-assisted mapping from skills
to Saudi occupation titles. Compliance teams manually match — error-prone
and unaudited.

TARGET:
Implement Occupation Code AI Matching with compliance validation:

1. Create /src/services/compliance/occupationCode.ts
   - OccupationCodeService class
   - suggestOccupationCode(skills: string[], requisitionTitle: string):
       Promise<OccupationCodeSuggestion[]>
     Returns ranked list:
       { code: string, titleAR: string, titleEN: string,
         confidenceScore: number, validationFlags: ValidationFlag[],
         isProhibited: boolean, missingCredentials: string[] }
   - validatePairing(candidateId, roleId): Promise<ValidationReport>
   - exportComplianceReport(candidateId, roleId): Promise<PDF>
   - Logs each suggestion to recommendation_audit_logs (actionType: COMPLIANCE_HINT)

2. Create /src/config/compliance/occupation-codes-ksav1.json
   - Saudi occupation code registry (configurable, versioned)
   - Prohibited title list
   - Required credential mappings per code category

3. Create /src/components/compliance/OccupationCodeMatcher.tsx
   - Embedded in candidate evaluation screen
   - Shows AI-suggested occupation codes (ranked by confidence)
   - Validation flags: invalid combination (red), prohibited title (red),
     missing credentials (amber), all-clear (green)
   - HR selects final code — selection is logged
   - "Export compliance report" button → triggers PDF export

4. Create /src/api/compliance/occupationCode.ts (API route)
   - POST /api/compliance/occupation-code/suggest
   - POST /api/compliance/occupation-code/validate
   - GET /api/compliance/occupation-code/report/:candidateId/:roleId

CONSTRAINTS:
- Prohibited titles must block selection, not just warn
- All AI suggestions logged to recommendation_audit_logs
- Export report must be a proper PDF with: candidate name, role title,
  suggested code, validation flags, HR decision, timestamp, tenantId
- Policy lists are config assets, not hardcoded

EVIDENCE COMMANDS:
npm run test:occupation-code-service
# Must cover: suggestion ranking, prohibited title blocking,
# missing credentials flagging, report generation

DELIVER:
- All TypeScript source files (full content)
- /src/config/compliance/occupation-codes-ksav1.json
- /src/tests/compliance/occupationCode.test.ts — minimum 15 test cases
```

---

### S36-G5 — Arabic RTL Build Pipeline Enforcement

```
GATE ID:   S36-G5
BRD REF:   Gold BRD A6, Consolidated §5.2
STATUS:    OPEN
```

**Claude Code Prompt — paste exactly:**

```
Activate Project Master Mode.
Reference: Gold BRD A6 (MANDATORY), Consolidated §5.2.

BASELINE:
Arabic RTL support exists partially. Build pipeline does NOT fail when
translation keys are missing. Tier-2 languages (Urdu, French, Spanish)
exist but are not structurally present from day one.

TARGET:
Implement mandatory RTL build enforcement and multilingual architecture:

1. Create /scripts/i18n/check-translations.js
   - Reads all translation key usage from /src/**/*.tsx and /src/**/*.ts
   - Compares against /src/locales/en.json (source of truth) and /src/locales/ar.json
   - EXIT CODE 1 if any key present in en.json is missing from ar.json
   - EXIT CODE 1 if any key used in source is missing from en.json
   - Prints clear error: "MISSING AR TRANSLATION: key.path.here"
   - This script is called in CI before build — builds CANNOT pass with missing keys

2. Update /src/locales/ structure:
   - /src/locales/en.json — complete English (source of truth)
   - /src/locales/ar.json — complete Arabic (must have every en.json key)
   - /src/locales/ur.json — Urdu (EMPTY VALUES but all keys present, feature-flagged)
   - /src/locales/fr.json — French (EMPTY VALUES but all keys present, feature-flagged)
   - /src/locales/es.json — Spanish (EMPTY VALUES but all keys present, feature-flagged)
   - Tier-2 languages must be STRUCTURALLY complete with empty values —
     enabling them later requires NO refactoring, only content filling

3. Create /src/hooks/useRTL.ts
   - Returns: { isRTL: boolean, dir: 'rtl' | 'ltr', locale: string }
   - Reads from language context
   - Used by all layout components to set dir attribute

4. Update global layout root:
   - <html dir={dir} lang={locale}> — dynamically set
   - All flex/grid layouts use logical CSS properties:
     margin-inline-start (not margin-left)
     padding-inline-end (not padding-right)
     text-align: start (not text-align: left)
   - Audit existing components — any hardcoded 'left'/'right' in layout
     context must be replaced with logical properties

5. Update CI configuration (.github/workflows/ci.yml or equivalent):
   - Add step: "Verify translations" → runs check-translations.js
   - Step runs BEFORE build step
   - Build step depends on translation check passing
   - Add comment: "# BRD A6: builds fail if translation keys missing"

6. Create /src/tests/i18n/rtl.test.ts
   - Tests: dir attribute sets correctly for AR locale
   - Tests: check-translations.js exits 1 on missing AR key (integration test)
   - Tests: all Tier-2 locale files have structural key parity with en.json

CONSTRAINTS:
- This is a HARD BUILD GATE — builds must fail on missing translation keys
- No hardcoded 'left'/'right' in layout-affecting CSS after this gate
- Arabic content must render in genuine RTL — not mirrored LTR
- Tier-2 languages must be off by default (feature flag: ENABLE_LOCALE_UR etc.)

EVIDENCE COMMANDS:
node scripts/i18n/check-translations.js
# Expected: EXIT 0 with "All translation keys verified"

# To verify the gate actually works:
node -e "require('fs').writeFileSync('src/locales/ar.json',
  JSON.stringify({...require('./src/locales/ar.json'), TEST_MISSING_KEY: undefined}))"
node scripts/i18n/check-translations.js
# Expected: EXIT 1 with error about missing key
# Then restore ar.json

npm run test:i18n

DELIVER:
- /scripts/i18n/check-translations.js (full content)
- Updated /src/locales/*.json (en, ar, ur, fr, es)
- /src/hooks/useRTL.ts (full content)
- Updated CI configuration (diff or full file)
- /src/tests/i18n/rtl.test.ts (full content)
- List of all layout components updated to logical CSS properties
```

---

### S36-G6 — Command Center: KPI Strip + Real-Time Signals + Quick Actions

```
GATE ID:   S36-G6
BRD REF:   WorkCaptain Eval §3.1 (P0 — Launch blocker)
STATUS:    OPEN
```

**Claude Code Prompt — paste exactly:**

```
Activate Project Master Mode.
Reference: WorkCaptain Eval §3.1, §3.2 (Command Center Paradigm).

BASELINE:
Platform has individual screens. Command Center route (/) is not built
as a decision OS. No real-time KPI strip, no entity-level risk indicators,
no zero-friction quick actions. The platform is pages, not a control center.

TARGET:
Build the Command Center as a single decision OS:

1. Create /src/pages/CommandCenter.tsx
   Route: /
   This is the first screen after login — not a landing page, a live OS.

   SECTION A — KPI Strip (top bar, always visible)
   Four live tiles:
   - Workforce %: (active workers / total roster) with trend arrow
   - Compliance %: (compliant records / total) — links to /compliance
   - Trust Score %: (positive resolutions / total) — links to /evidence
   - Cost vs Budget: (actual spend / approved budget) — links to /payments
   Each tile: large number, 7-day trend sparkline, status color
   (green >=85%, amber 70–84%, red <70%)
   Click: navigates to relevant drill-down screen

   SECTION B — Entity Risk Board (main area, scrollable)
   Three columns: People | Projects | Compliance
   Each entity shows a green/amber/red risk indicator dot
   Hover/click: shows why the risk level was assigned
   Risk logic:
   - Red: expiring document in <7 days, probation deadline missed,
     compliance score <60%, payment overdue >48h
   - Amber: expiring document 7–30 days, pending AI approval >24h,
     compliance score 60–79%
   - Green: all clear

   SECTION C — Quick Actions (floating action strip or sidebar)
   Zero-friction actions (one click + one confirmation):
   - "Create role" → opens role creation drawer
   - "Assign task" → opens task assignment drawer
   - "Generate contract" → opens contract template selector
   - "Run compliance check" → triggers compliance scan for active roster
   - "Approve pending AI" → navigates to /ai pending queue

   SECTION D — AI Insight Panel (right sidebar)
   - Latest 3 AI recommendations with confidence scores
   - Each shows approve/reject inline (calls S36-G2 approval endpoints)
   - "View all" → navigates to /ai

2. Create /src/components/dashboard/KPIStrip.tsx
   - Real-time data (polling every 30s or WebSocket if available)
   - Skeleton loading state
   - Each metric links to its detail screen

3. Create /src/components/dashboard/RiskBoard.tsx
   - Risk dot component with tooltip explanation
   - Color-coded: uses CSS variables --color-background-success/warning/danger
   - Keyboard accessible (tab + enter to view risk detail)

4. Create /src/api/dashboard/kpi.ts
   - GET /api/dashboard/kpi
   - Returns all four KPI values + 7-day trend arrays
   - Cached with 30-second stale-while-revalidate

CONSTRAINTS:
- KPI Strip must be visible and populated on first load
- Risk indicators must use semantic CSS variables — no hardcoded hex colors
- Quick actions must not require navigation — drawers/modals open inline
- All KPIs must degrade gracefully (show "—" not crash if data unavailable)
- This screen must pass WCAG 2.2 AA (part of S39-G4 CI gate)

EVIDENCE COMMANDS:
npm run test:command-center
npm run build && npm run lighthouse -- --url=/ --only-categories=performance
# Attach: Lighthouse report — target LCP < 2.5s

DELIVER:
- /src/pages/CommandCenter.tsx (full content)
- /src/components/dashboard/KPIStrip.tsx (full content)
- /src/components/dashboard/RiskBoard.tsx (full content)
- /src/api/dashboard/kpi.ts (full content)
- /src/tests/dashboard/CommandCenter.test.tsx — minimum 12 test cases
```

---

### S36-G7 — S36 Closure: Evidence Pack + Notion Update

```
GATE ID:   S36-G7
TYPE:      Manual closure — human-only
BRD REF:   AI Execution Strategy §V (Evidence Packs), Gold BRD A7
```

**Closure Checklist (human-executed):**
```
[ ] S36-G1 evidence attached to Notion: auditLog schema + test coverage report
[ ] S36-G2 evidence attached: AI control screen accessibility report + test PASS
[ ] S36-G3 evidence attached: Nitaqat test coverage + screenshot with Arabic text
[ ] S36-G4 evidence attached: OccupationCode tests PASS + sample PDF export
[ ] S36-G5 evidence attached: check-translations.js output + CI pipeline screenshot
[ ] S36-G6 evidence attached: Command Center build + Lighthouse report
[ ] All 6 PRs merged under branch protection with required reviews
[ ] Notion S36 program node updated: all gate statuses = CLOSED/PASS
[ ] No CRITICAL BRD compliance items remain in amber or red for S36 scope
```

---

## SPRINT S37 — SOVEREIGN ONBOARDING + HIRING

```
Sprint:    S37
Objective: Deploy WPS readiness, probation governance, and Qiwa contract mirroring
Gates:     S37-G1 through S37-G7
BRD Refs:  WOS §6.1, §6.2, §8.1, §9.1, §9.2
Dependency: S36 FULLY CLOSED
```

---

### S37-G1 — WPS Readiness Pack

```
GATE ID:   S37-G1
BRD REF:   WOS §9.1
STATUS:    OPEN
```

**Claude Code Prompt — paste exactly:**

```
Activate Project Master Mode.
Reference: WOS §9.1.

BASELINE:
No WPS Readiness Pack exists. Onboarding has no IBAN capture, identity
verification steps, bank confirmation, or downloadable WPS artifact.
This is a P0 gap blocking KSA employer onboarding.

TARGET:
Implement WPS Readiness Pack as a governed onboarding workflow:

1. Create /src/services/onboarding/wpsReadiness.ts
   - WPSReadinessService class
   - generateReadinessPack(employeeId): Promise<WPSReadinessPack>
     Pack includes:
       ibanStatus: VERIFIED | PENDING | FAILED
       identityVerificationStatus: VERIFIED | PENDING | FAILED
       bankConfirmationStatus: CONFIRMED | PENDING | FAILED
       wpsDataPackage: WPSDataPackage (salary data structured per WPS rules)
       downloadableArtifact: { url, generatedAt, expiresAt }
       evidencePackId: string (links to EP-WOS-ONBOARD-01)
   - validateIBAN(iban: string): { valid: boolean, bank: string, country: string }
   - generateWPSDataPackage(employee): WPSDataPackage
     - Validates salary file structure rules
     - Returns downloadable structured file

2. Create /src/db/migrations/YYYYMMDD_create_wps_readiness.sql
   - Table: wps_readiness_records
   - Fields: id, employeeId, tenantId, ibanHash (not stored raw), bankCode,
     bankConfirmedAt, identityDocumentId, wpsPackageUrl, packageGeneratedAt,
     packageVersion, evidencePackId, createdAt, updatedAt
   - RLS: tenant isolation enforced

3. Create /src/components/onboarding/WPSReadinessPack.tsx
   - Progressive disclosure form — not a static checklist
   - Step 1: IBAN capture (validated format + bank lookup)
   - Step 2: Identity document upload (ID type, number, expiry)
   - Step 3: Bank confirmation (manual or integration)
   - Step 4: WPS package generation + download button
   - Each step shows: VERIFIED badge, timestamp, who verified
   - Evidence pack auto-generates on Step 4 completion
   - Arabic RTL layout required (uses useRTL() hook from S36-G5)
   - Progress indicator: 4 steps with completion status

4. Evidence Pack integration (EP-WOS-ONBOARD-01):
   Create /src/services/evidence/packs/ep-wos-onboard-01.ts
   - generateEvidencePack(employeeId): creates EP-WOS-ONBOARD-01
   - Includes: all WPS step completion records, timestamps, approvers,
     document references, IBAN verification result (not raw IBAN)
   - Stored as evidence pack (see S38-G2 for full EP schema)

CONSTRAINTS:
- IBAN must NEVER be stored raw — hash only (SHA-256)
- Identity documents stored as secure references, not raw in DB
- WPS package generation must be idempotent (safe to regenerate)
- Arabic layout is mandatory — this form is used by Arabic-speaking HR teams
- Evidence pack auto-generates — no manual step allowed

EVIDENCE COMMANDS:
npm run test:wps-readiness
# Must cover: IBAN validation, pack generation, evidence pack creation,
# idempotency on regeneration

DELIVER:
- All TypeScript source files (full content)
- /src/db/migrations/YYYYMMDD_create_wps_readiness.sql
- /src/tests/onboarding/wpsReadiness.test.ts — minimum 18 test cases
```

---

### S37-G2 — Probation Governance (90/180-Day + Day-80 Automation)

```
GATE ID:   S37-G2
BRD REF:   WOS §9.2
STATUS:    OPEN
```

**Claude Code Prompt — paste exactly:**

```
Activate Project Master Mode.
Reference: WOS §9.2.

BASELINE:
No probation governance module exists. Probation periods are untracked.
Day-80 automation does not exist. Probation decisions have no evidence pack.

TARGET:
Implement full probation governance lifecycle:

1. Create /src/services/onboarding/probationGovernance.ts
   - ProbationGovernanceService class
   - initiateProbation(employeeId, startDate, periodDays: 90 | 180)
   - getStatus(employeeId): ProbationStatus
     Returns: { currentDay, periodDays, daysRemaining, triggerDay80Sent,
       evidencePackStatus, decision, decisionMadeAt, decisionMadeBy }
   - compileProbationEvidencePack(employeeId): Promise<EvidencePack>
     Gathers: task completion records, manager review records,
     policy acknowledgement records, attendance signals (if available),
     probation extension agreement (if applicable)
   - recordDecision(employeeId, decision: CONFIRM | EXTEND | TERMINATE,
       reasonCode: string, approverId: userId): Promise<void>
     - Human approval MANDATORY — no auto-decision
     - All decisions produce final evidence pack
     - TERMINATE decision requires additional: terminationReasonCode,
       noticeDetails, final settlement checklist items

2. Create /src/jobs/probation/day80Automation.ts
   - Background job: runs daily at 06:00 UTC
   - Finds all employees where (today - probationStartDate) == 80 days
   - Calls compileProbationEvidencePack() for each
   - Creates notification: to HR Manager + Hiring Manager
   - Sets evidencePackStatus = COMPILED on probation record
   - Logs job execution with: employeeIds processed, packs generated,
     notifications sent, errors encountered
   - Idempotent: safe to re-run (will not duplicate packs)

3. Create /src/components/onboarding/ProbationTimeline.tsx
   - Visual countdown: day N of 90/180 with progress bar
   - Milestone markers: Day 30 (first review), Day 60 (mid review),
     Day 80 (evidence pack auto-compiled), Day 90/180 (decision required)
   - Current status badge: ON TRACK | EVIDENCE READY | DECISION REQUIRED
   - Decision workflow UI (appears at Day 80+):
     Three buttons: CONFIRM | EXTEND | TERMINATE
     Each requires: reason code selection + free text + confirmer identity
     EXTEND: shows extension agreement form (up to 180 days max)
     TERMINATE: shows notice + settlement checklist
   - Arabic RTL layout required

4. Create /src/db/migrations/YYYYMMDD_create_probation_governance.sql
   - Table: probation_records
   - Full schema including decision fields, extension tracking, evidence pack refs
   - Index on (tenantId, probationEndDate) for deadline alerts

CONSTRAINTS:
- Day-80 automation is a background job — must be separately testable
- CONFIRM/EXTEND/TERMINATE decisions are human-only — no AI auto-decision
- TERMINATE decision requires additional validation (reason codes + settlement items)
- Evidence pack must auto-generate at Day 80 — HR cannot be required to trigger it
- Extension maximum is 180 days total from start date (not 180 from extension)

EVIDENCE COMMANDS:
npm run test:probation-governance
# Must cover: Day-80 trigger logic, decision recording,
# evidence pack compilation, extension limits, idempotency

# Simulate Day-80 trigger:
node -e "require('./src/jobs/probation/day80Automation').runOnce()"
# Attach: output showing packs compiled

DELIVER:
- All TypeScript source files (full content)
- /src/db/migrations/YYYYMMDD_create_probation_governance.sql
- /src/tests/onboarding/probationGovernance.test.ts — minimum 20 test cases
- /src/tests/jobs/day80Automation.test.ts — minimum 10 test cases
```

---

### S37-G3 — Qiwa Contract Mirroring (Contract Lifecycle State Machine)

```
GATE ID:   S37-G3
BRD REF:   WOS §8.1
STATUS:    OPEN
```

**Claude Code Prompt — paste exactly:**

```
Activate Project Master Mode.
Reference: WOS §8.1.

BASELINE:
Contract lifecycle is basic. No field-level parity mapping for Qiwa
mirroring. No structured lifecycle state machine enforcing valid
transitions. Contract as structured data stream not implemented.

TARGET:
Implement Qiwa-mirroring digital contract state machine:

1. Create /src/services/contracts/contractStateMachine.ts
   - ContractStateMachine class
   - States: DRAFT → REVIEW → SIGNED → ACTIVATED → AMENDED → TERMINATED
   - Valid transitions:
     DRAFT → REVIEW (requires completeness check)
     REVIEW → DRAFT (revision)
     REVIEW → SIGNED (requires both party signatures)
     SIGNED → ACTIVATED (requires activation date)
     ACTIVATED → AMENDED (requires amendment reason + new fields)
     ACTIVATED → TERMINATED (requires termination code + notice + approver)
     TERMINATED is a terminal state — no transitions out
   - transition(contractId, newState, actor, reason?, evidence?): Promise<Contract>
   - All invalid transitions throw ContractTransitionError with clear message
   - All transitions logged to contract_lifecycle_events (immutable)

2. Create /src/services/contracts/qiwaFieldMapping.ts
   - QIWA_FIELD_MAP: maps ProWork contract fields → Qiwa field names
     {
       role: "POSITION_TITLE",
       baseSalary: "BASIC_WAGE",
       housingAllowance: "HOUSING_ALLOWANCE",
       transportAllowance: "TRANSPORT_ALLOWANCE",
       probationPeriodDays: "PROBATION_PERIOD",
       noticePeriodDays: "NOTICE_PERIOD",
       contractDurationMonths: "CONTRACT_DURATION",
       workLocation: "WORK_LOCATION",
       ... (all required Qiwa fields)
     }
   - generateQiwaPayload(contract): QiwaContractPayload
     Returns Qiwa-structured payload — ready for future API integration
   - validateQiwaCompleteness(contract): ValidationResult
     Flags any missing required Qiwa fields before REVIEW transition

3. Create /src/db/migrations/YYYYMMDD_create_contract_lifecycle.sql
   - Table: contract_lifecycle_events (immutable append-only)
   - Fields: id, contractId, fromState, toState, actor, reason, evidence (jsonb),
     timestamp (UTC), tenantId, qiwaPayloadSnapshot (jsonb)
   - No DELETE or UPDATE grants on this table

4. Create /src/components/contracts/ContractLifecycleTracker.tsx
   - Visual state machine: shows current state + valid next transitions
   - Each state shows: who set it, when, and what evidence was attached
   - Transition buttons: only valid transitions shown (not greyed-out invalids)
   - TERMINATE flow: requires: terminationReason code + noticePeriod +
     signatories + final settlement checklist confirmation
   - Qiwa field completeness indicator: green/amber/red badge
   - Arabic + English field labels (bilingual display required)

CONSTRAINTS:
- Invalid state transitions must be blocked at service AND database level
- contract_lifecycle_events is immutable — no updates/deletes ever
- Qiwa field mapping is a config asset, versioned, not hardcoded
- Human approval required for SIGNED and TERMINATED transitions
- Terminated contracts cannot be re-activated (terminal state)

EVIDENCE COMMANDS:
npm run test:contract-state-machine
# Must cover: all valid transitions, all invalid transition rejections,
# Qiwa payload generation, field completeness validation

DELIVER:
- All TypeScript source files (full content)
- /src/db/migrations/YYYYMMDD_create_contract_lifecycle.sql
- /src/config/contracts/qiwa-field-mapping-v1.json
- /src/tests/contracts/contractStateMachine.test.ts — minimum 25 test cases
  (all state transitions, both valid and invalid paths)
```

---

### S37-G4 — Compensation Transparency + Policy Threshold Validation

```
GATE ID:   S37-G4
BRD REF:   WOS §8.2
STATUS:    OPEN
```

**Claude Code Prompt — paste exactly:**

```
Activate Project Master Mode.
Reference: WOS §8.2.

BASELINE:
Offer builder does not enforce compensation breakdown or validate
against policy thresholds. No pre-offer compliance preview exists.

TARGET:
Implement compensation transparency and compliance-first offer builder:

1. Create /src/services/contracts/compensationPolicy.ts
   - CompensationPolicyEngine class
   - validateBreakdown(offer: CompensationOffer): ValidationResult
     Enforces: base salary + housing allowance + transport allowance
     = total compensation (no unexplained gaps)
   - checkPolicyThresholds(offer, roleCategory, region): ThresholdResult
     Checks against configurable minimum/maximum thresholds per category
     Returns: { passes: boolean, violations: PolicyViolation[] }
   - calculateIndicativeContributions(offer): ContributionEstimates
     Returns: indicative GOSI employer + employee amounts (policy calculators,
     not legal advice — platform shows estimates, user confirms inputs)
   - generatePreOfferCompliancePreview(offer): CompliancePreview
     Returns: all issues before offer is sent (pre-flight check)

2. Create /src/config/compliance/compensation-policy-v1.json
   - Configurable thresholds by role category, region, contract type
   - Versioned policy asset — regulatory updates do not require code changes

3. Create /src/components/contracts/OfferBuilder.tsx
   - Compensation breakdown enforced (base + allowances fields, not single total)
   - Real-time policy threshold validation as user types
   - GOSI indicative contribution calculator (shows estimates with disclaimer)
   - Pre-offer compliance preview panel (appears before send):
     - Lists all passed checks (green)
     - Lists all warnings (amber — can proceed with acknowledgement)
     - Lists all violations (red — blocks sending until resolved)
   - Arabic + English labels on all fields

CONSTRAINTS:
- GOSI calculations are policy-driven estimates — always show disclaimer:
  "These are indicative estimates based on policy rules. Confirm with your
   compliance advisor before filing."
- Policy thresholds must be configurable — not hardcoded
- Offer cannot be sent if red compliance violations exist
- Amber warnings require explicit HR acknowledgement before sending

EVIDENCE COMMANDS:
npm run test:compensation-policy-engine
npm run test:offer-builder

DELIVER:
- All TypeScript source files (full content)
- /src/config/compliance/compensation-policy-v1.json
- Tests: minimum 15 test cases covering all threshold scenarios
```

---

### S37-G5 — Unified FTE + Freelancer Profile (WOS §6.1)

```
GATE ID:   S37-G5
BRD REF:   WOS §6.1, §6.2
STATUS:    OPEN
```

**Claude Code Prompt — paste exactly:**

```
Activate Project Master Mode.
Reference: WOS §6.1, §6.2.

BASELINE:
Worker profiles exist for freelancers only. No unified FTE+Freelancer
entity model. No shared capacity model. Internal talent marketplace
does not prioritize FTE over freelancer search.

TARGET:
Implement unified worker entity with FTE extension and internal marketplace:

1. Create/update /src/models/worker.ts
   - WorkerEntity: shared fields (identity, skills, history, verificationStatus)
   - type: 'FREELANCER' | 'FTE'
   - FTE-specific extensions: employmentStartDate, establishment, costCenter,
     lineManager, contractType, probationStatus, wpsReadinessStatus
   - Shared capacity model:
     weeklyAvailableHours, currentAllocations (array of {projectId, hours}),
     plannedLeave (optional), utilizationPercentage (computed)

2. Update /src/services/workforce/talentMarketplace.ts
   - searchForRole(roleRequirements): SearchResult[]
   - Internal FTE search FIRST: match on skills, availability, costCenter rules
   - If no FTE capacity → expand to freelancer marketplace (with explainable rationale)
   - Rationale must be logged in recommendation_audit_logs
   - Allocation conflict detection:
     If proposed hours + currentAllocations > weeklyAvailableHours → flag conflict
     Conflicts require approval workflow before assignment

3. Create /src/components/workforce/WorkforceCommand.tsx
   Route: /workforce
   - Unified table: FTE + Freelancers with type indicator
   - Columns: name, type, skills match %, availability, allocation %, compliance status
   - AI insight panel (right): top 3 AI match suggestions with confidence
   - Filters: type, department, availability status, compliance risk level
   - Allocation conflict alerts (red badge on worker row if overallocated)

CONSTRAINTS:
- FTE-first search is a business rule, not optional — log when fallback to freelancer
- Allocation conflicts must be detected, not silently accepted
- Type indicator must be always visible (FTE vs FREELANCER)

EVIDENCE COMMANDS:
npm run test:workforce-talent-marketplace
# Must cover: FTE-first ordering, fallback logging, conflict detection

DELIVER:
- All TypeScript source files (full content)
- Tests: minimum 15 test cases
```

---

### S37-G6 — Compliance & Risk Screen

```
GATE ID:   S37-G6
BRD REF:   WorkCaptain Eval §3.1 (/compliance screen)
STATUS:    OPEN
```

**Claude Code Prompt — paste exactly:**

```
Activate Project Master Mode.
Reference: WorkCaptain Eval §3.1 (/compliance), WOS §7.1, §9.1, §9.2.
Dependency: S36-G3 (Nitaqat), S37-G1 (WPS), S37-G2 (Probation) must be CLOSED.

BASELINE:
No /compliance screen exists. Compliance status is not visible centrally.
Employers cannot see their Nitaqat zone, WPS readiness, or probation deadlines.

TARGET:
Build the Compliance & Risk Control Screen:

1. Create /src/pages/compliance/ComplianceRiskScreen.tsx
   Route: /compliance

   SECTION A — Compliance Score Widget
   - Single overall % with color coding (green/amber/red)
   - Drill-down on click: shows component breakdown
   - Four components: Nitaqat Zone, WPS Readiness, Probation Status, Documentation

   SECTION B — Nitaqat Zone Indicator
   - Current zone badge (Platinum/Green/Yellow/Red) always visible
   - Saudi workforce % with trend
   - "Employees affecting zone" — clickable list
   - Link to Nitaqat Impact Preview for any new hire

   SECTION C — WPS Readiness Table
   - All active employees with WPS readiness status
   - Columns: name, IBAN status, identity status, bank status, pack status
   - Red rows: any FAILED step
   - Amber rows: PENDING more than 7 days
   - Download button per row → downloads WPS pack

   SECTION D — Probation Deadlines
   - Visual timeline of all active probations
   - Countdown badges: "12 days to decision" (amber <30d, red <7d)
   - Employees at Day 80+: "Evidence pack ready — decision required" (prominent)
   - Quick action: navigate to probation decision for that employee

   SECTION E — Document Expiry Alerts
   - Employees with documents expiring in 0–30 days
   - Sorted by urgency

   All compliance notifications in Arabic when locale=ar (RTL layout)

CONSTRAINTS:
- Compliance score is computed from real data — not a static display
- Arabic notifications are mandatory for every alert
- Red items must be visually prominent — not hidden in collapsed sections

EVIDENCE COMMANDS:
npm run test:compliance-risk-screen
npm run test:accessibility -- --page=/compliance

DELIVER:
- /src/pages/compliance/ComplianceRiskScreen.tsx (full content)
- Tests: minimum 12 test cases
- Accessibility report for /compliance
```

---

### S37-G7 — S37 Closure: Evidence Packs EP-WOS-ONBOARD-01 + EP-WOS-HIRE-01

```
GATE ID:   S37-G7
TYPE:      Manual closure — human-only
```

**Closure Checklist:**
```
[ ] S37-G1 evidence: WPS Readiness Pack — sample pack generated + tests PASS
[ ] S37-G2 evidence: Day-80 automation run output + probation decision test PASS
[ ] S37-G3 evidence: Contract lifecycle tests (all 25 transitions) PASS
[ ] S37-G4 evidence: Compensation policy tests PASS + sample pre-offer preview screenshot
[ ] S37-G5 evidence: Workforce command screen screenshot + marketplace FTE-first test
[ ] S37-G6 evidence: Compliance screen screenshot (showing Nitaqat zone + WPS table)
[ ] EP-WOS-ONBOARD-01: sample generated and reviewed (IBAN, KYC, WPS artifact)
[ ] EP-WOS-HIRE-01: sample generated and reviewed (contract signed, field mapping)
[ ] All PRs merged under branch protection
[ ] Notion S37 program node updated
```

---

## SPRINT S38 — EVIDENCE FABRIC + MENA PAYMENTS

```
Sprint:    S38
Objective: Deploy full evidence pack infrastructure and MENA payment rails
Gates:     S38-G1 through S38-G7
BRD Refs:  Gold BRD A7, WOS §11.3, Maqaleed eval §3 (PSP matrix)
Dependency: S37 FULLY CLOSED
```

---

### S38-G1 — MENA PSP Adapters (Tap + HyperPay)

```
GATE ID:   S38-G1
BRD REF:   Maqaleed eval §3, WorkCaptain Eval §5.1
STATUS:    OPEN
```

**Claude Code Prompt — paste exactly:**

```
Activate Project Master Mode.
Reference: Maqaleed eval §3 PSP matrix, WorkCaptain Eval §5.1.

BASELINE:
Payment execution layer is live with simulated webhook ledger.
Tap Marketplaces and HyperPay HyperSplit are not integrated.
mada rail is unavailable. MENA-first payout routing does not exist.

TARGET:
Implement MENA PSP adapter layer:

1. Create /src/services/payments/psp/PspAdapter.ts
   - Abstract PspAdapter interface:
     charge(params): Promise<ChargeResult>
     refund(chargeId, amount): Promise<RefundResult>
     splitPayout(params): Promise<PayoutResult>
     getPayoutStatus(payoutId): Promise<PayoutStatus>
     webhookVerify(payload, signature): boolean

2. Create /src/services/payments/psp/TapAdapter.ts
   - Implements PspAdapter for Tap Marketplaces
   - Supports: mada, Visa, Mastercard, Apple Pay, stcPay
   - Split settlement: buyer funds → escrow → freelancer payout
   - Webhook events: CHARGE.CREATED, CHARGE.CAPTURED, PAYOUT.PAID, PAYOUT.FAILED
   - All credentials via environment variables (never hardcoded)
   - Sandbox mode (TAP_ENV=sandbox) — used in tests

3. Create /src/services/payments/psp/HyperPayAdapter.ts
   - Implements PspAdapter for HyperPay HyperSplit
   - Supports: mada, local KSA debit/credit
   - Split settlement per HyperPay marketplace model
   - Webhook handling for all HyperPay payment events
   - Sandbox mode

4. Create /src/services/payments/pspRouter.ts
   - PSP routing matrix:
     (buyerCardBIN, buyerCountry, buyerPaymentMethod) → PSP selection
     KSA buyer + mada → Tap (primary) or HyperPay (fallback)
     KSA buyer + Visa/MC → Tap
     Global buyer → Stripe (existing)
   - Logs every routing decision
   - Fallback logic: if primary PSP fails, route to secondary
   - Circuit breaker: if PSP fails 3 times in 60s, break and alert

5. Update /src/services/payments/escrow.ts
   - Route escrow capture through pspRouter (not directly to Stripe)
   - MENA payout SLA target: ≤30 minutes where PSP supports instant
   - Payout ETA badge data: method, fees, currency, cut-off, ETA, failure handling

6. Create /src/api/payments/payoutMatrix.ts
   - GET /api/payments/payout-matrix
   - Returns: for current user's country/method: fees, ETA, currency options
   - Displayed in-product on contract and earnings screens

CONSTRAINTS:
- All PSP credentials via environment variables only — never in code or git
- Sandbox mode must be separately testable without real money movement
- Routing decisions must be logged for reconciliation audit
- Circuit breaker prevents cascade failures on PSP outages
- Payout matrix must be accurate and visible before any payment commitment

EVIDENCE COMMANDS:
TAP_ENV=sandbox npm run test:tap-adapter
HYPERPAY_ENV=sandbox npm run test:hyperpay-adapter
npm run test:psp-router
# All must PASS in sandbox mode

DELIVER:
- All TypeScript source files (full content)
- /src/tests/payments/tapAdapter.test.ts — minimum 15 test cases (sandbox)
- /src/tests/payments/hyperPayAdapter.test.ts — minimum 15 test cases (sandbox)
- /src/tests/payments/pspRouter.test.ts — minimum 12 test cases
- Environment variable documentation (which vars required for each PSP)
```

---

### S38-G2 — Evidence Pack Schema + Immutable Audit Fabric

```
GATE ID:   S38-G2
BRD REF:   Gold BRD A7, WOS §11.3, WorkCaptain Eval §8
STATUS:    OPEN
```

**Claude Code Prompt — paste exactly:**

```
Activate Project Master Mode.
Reference: Gold BRD A7, WOS §11.3, WorkCaptain Eval §8.1 (all 8 required fields).

BASELINE:
Evidence packs are referenced in multiple services but no central schema,
storage, or retrieval infrastructure exists. EP-WOS series packs cannot
be assembled, viewed, or exported.

TARGET:
Implement the full Evidence Pack infrastructure:

1. Create /src/services/evidence/evidencePack.ts
   - EvidencePackService class
   - create(params: EvidencePackParams): Promise<EvidencePack>
   - attach(packId, files: EvidenceFile[]): Promise<void>
   - close(packId, closedBy: userId): Promise<void>
   - export(packId, format: 'JSON' | 'PDF' | 'ZIP'): Promise<ExportResult>
   - get(packId): Promise<EvidencePack>

2. Evidence Pack schema (enforced by DB + TypeScript):
   Fields (all mandatory per WorkCaptain Eval §8.1):
   - id (uuid)
   - packType (EP_WOS_RECRUIT_01 | EP_WOS_HIRE_01 | EP_WOS_ONBOARD_01 |
               EP_WOS_PROB_01 | EP_WOS_OFFBOARD_01)
   - actor: { id, name, role: 'HR' | 'AI' | 'SYSTEM' | 'MANAGER' }
   - action (what was done — human readable)
   - timestamp (UTC, immutable — set on create, never updated)
   - dataSnapshot (jsonb — state before/after for the event)
   - attachedFiles: EvidenceFile[] (each: fileId, fileName, fileType, url, uploadedBy, uploadedAt)
   - approvalChain: Approval[] (each: approverId, approverRole, decision, timestamp, notes)
   - aiArtifacts: AIArtifact[] (each: modelVersion, promptHash, outputSnapshot, confidence)
   - redactionRules: RedactionRule[] (PDPL-compliant field masking)
   - tenantId (uuid — tenant isolation enforced)
   - immutableHash (SHA-256 of all fields — verified on every read)
   - exportedAt (timestamp, nullable — set when first exported)
   - status: OPEN | CLOSED | EXPORTED

3. Create /src/db/migrations/YYYYMMDD_create_evidence_packs.sql
   - Tables: evidence_packs, evidence_files, evidence_approvals, evidence_ai_artifacts
   - All tables: append-only for critical fields (no UPDATE on closed packs)
   - RLS: tenant isolation on all tables
   - Index: (tenantId, packType, status)

4. Create /src/services/evidence/redaction.ts
   - applyRedactionRules(pack, requestingRole): RedactedEvidencePack
   - Rules: national ID visible to HR only, salary visible to Finance + HR,
     medical data visible to HR only (PDPL Article 23 compliance)
   - Redaction is non-destructive — original stored, redacted view returned

5. Update all services that reference EP pack IDs to call EvidencePackService:
   - wpsReadiness.ts (EP-WOS-ONBOARD-01)
   - contractStateMachine.ts (EP-WOS-HIRE-01)
   - probationGovernance.ts (EP-WOS-PROB-01)
   - (Offboarding in S38-G6: EP-WOS-OFFBOARD-01)

CONSTRAINTS:
- Immutable hash verified on every get() — corrupted pack throws EvidenceIntegrityError
- Closed packs cannot be modified — append-only after close()
- Redaction rules are applied based on requestingRole — never expose raw sensitive data
- All 8 required schema fields must be present — partial packs cannot be closed

EVIDENCE COMMANDS:
npm run test:evidence-pack-service
# Must cover: creation, attachment, immutability, redaction,
# hash verification, tenant isolation

psql -c "SELECT COUNT(*) FROM evidence_packs WHERE immutableHash IS NULL;"
# Expected: 0

DELIVER:
- All TypeScript source files (full content)
- /src/db/migrations/YYYYMMDD_create_evidence_packs.sql
- /src/tests/evidence/evidencePack.test.ts — minimum 25 test cases
```

---

### S38-G3 — Trust & Evidence Screen (/evidence)

```
GATE ID:   S38-G3
BRD REF:   WorkCaptain Eval §3.1 (/evidence screen), Gold BRD A7
STATUS:    OPEN
```

**Claude Code Prompt — paste exactly:**

```
Activate Project Master Mode.
Reference: WorkCaptain Eval §3.1, §8.2, Gold BRD A7.
Dependency: S38-G2 (Evidence Pack schema) must be CLOSED.

BASELINE:
No /evidence screen exists. Evidence packs cannot be viewed, searched,
or exported from the product. Enterprise clients cannot self-serve audit
requests. This is a hard enterprise sales prerequisite.

TARGET:
Build the Trust & Evidence Control Screen:

1. Create /src/pages/evidence/TrustEvidenceScreen.tsx
   Route: /evidence

   SECTION A — Evidence Pack Library
   - Table: all evidence packs for current tenant
   - Columns: pack ID, type, subject (employee/contract name), status,
     created date, closed date, last exported, action buttons
   - Filters: packType, status, dateRange, subject name search
   - Status badges: OPEN (amber), CLOSED (green), EXPORTED (blue)

   SECTION B — Pack Detail Viewer (click row to expand or open panel)
   - Full pack contents rendered: actor, action, timestamp, data snapshot
   - Attached files list with download links
   - Approval chain: visual timeline of who approved what + when
   - AI artifacts: model version, confidence, rationale (if present)
   - Redaction indicator: shows which fields are redacted for current role
   - Integrity status: "Hash verified ✓" or "INTEGRITY ERROR ✗"

   SECTION C — Export Controls
   - Per-pack export: JSON | PDF | ZIP bundle
   - Bulk export: select multiple packs → ZIP of all selected
   - Export is logged in the pack record
   - Export SLA target: ≤60 seconds for any single pack (UI shows progress)

   SECTION D — Audit Trail
   - All access and export events for this tenant
   - Who viewed what, when, and what they exported
   - Non-deletable log

2. Create /src/components/evidence/EvidencePackViewer.tsx
   - Standalone component — embeds in /evidence AND in other screens
   - Renders any EvidencePack object (all types)
   - Redaction-aware: shows "[Redacted]" for fields hidden from current role

3. Create /src/api/evidence/export.ts
   - POST /api/evidence/export
   - Accepts: packId, format, requestingUserId
   - Generates ZIP/PDF bundle
   - Updates pack.exportedAt
   - Returns: { downloadUrl, expiresAt, generatedInMs }
   - Must complete in ≤60 seconds for single pack

CONSTRAINTS:
- Export must complete in ≤60 seconds (hard SLA from WorkCaptain Eval §11.2)
- Integrity verification on every pack load — show INTEGRITY ERROR if hash fails
- Role-based redaction applied in viewer — HR vs Finance vs Viewer roles see different fields
- Export action logged in pack audit trail

EVIDENCE COMMANDS:
npm run test:evidence-screen
time node -e "require('./src/api/evidence/export').exportPack('test-pack-id', 'ZIP')"
# Expected: ≤60000ms

DELIVER:
- All TypeScript source files (full content)
- Tests: minimum 15 test cases including SLA timing test
```

---

### S38-G4 — ESB Calculator (Versioned Policy Engine)

```
GATE ID:   S38-G4
BRD REF:   WOS §10.2
STATUS:    OPEN
```

**Claude Code Prompt — paste exactly:**

```
Activate Project Master Mode.
Reference: WOS §10.2.

BASELINE:
No ESB (End of Service Benefit) calculator exists. Employers manually
calculate severance — error-prone and unauditable. No versioned policy
engine for ESB rules.

TARGET:
Implement ESB Calculator as a versioned policy engine:

1. Create /src/services/compliance/esbCalculator.ts
   - ESBPolicyEngine class
   - calculate(params: ESBParams, policyVersion: string): ESBCalculationResult
     Params: { employmentStartDate, terminationDate, basicSalary,
               housingAllowance, yearsOfService, terminationReason,
               contractType, employeeNationality }
     Result: { grossESB, calculationBreakdown, policyVersion, disclaimer,
               evidencePackData, inputs (snapshot), outputs (snapshot) }
   - getPolicyVersions(): PolicyVersion[] — list all available versions
   - getActivePolicyVersion(): string

2. Create /src/config/compliance/esb-policy-v1.json
   - KSA Labor Law ESB calculation rules (versioned config asset)
   - Thresholds, multipliers, maximum caps per tenure bracket
   - Termination reason modifiers
   - Version: "v1" with effectiveDate

3. Create /src/components/compliance/ESBCalculator.tsx
   - Input form: all required params
   - Policy version selector (customer selects applicable version)
   - Real-time calculation as inputs change
   - Calculation breakdown: shows each component + formula
   - Disclaimer: "This is a policy-driven estimate. Confirm with legal counsel."
   - "Store calculation as evidence" button → saves inputs + outputs to evidence pack
   - Stored calculation becomes part of EP-WOS-OFFBOARD-01

4. Update /src/services/evidence/packs/ep-wos-offboard-01.ts
   - Include ESB calculation evidence (inputs, outputs, policy version, calculator ID)

CONSTRAINTS:
- Policy rules are config assets — must be swappable without code deploy
- Customer selects policy version — not auto-forced to latest
- Calculation inputs AND outputs must both be stored in evidence
- Disclaimer is mandatory and must be visible at all times

EVIDENCE COMMANDS:
npm run test:esb-calculator
# Must cover: each tenure bracket, all termination reason modifiers,
# policy version selection, evidence storage

DELIVER:
- All TypeScript source files (full content)
- /src/config/compliance/esb-policy-v1.json
- Tests: minimum 18 test cases
```

---

### S38-G5 — Offboarding Workflow + EP-WOS-OFFBOARD-01

```
GATE ID:   S38-G5
BRD REF:   WOS §10.2
STATUS:    OPEN
```

**Claude Code Prompt — paste exactly:**

```
Activate Project Master Mode.
Reference: WOS §10.2.
Dependency: S38-G2 (EvidencePack schema), S38-G4 (ESB Calculator) must be CLOSED.

BASELINE:
No offboarding workflow exists. No structured handover task tracking.
No final settlement checklist. No offboarding evidence pack.

TARGET:
Implement offboarding workflow with evidence generation:

1. Create /src/services/offboarding/offboardingWorkflow.ts
   - OffboardingService class
   - initiateOffboarding(employeeId, reason: OffboardingReason,
       noticeDate, lastWorkingDate, approver): Promise<OffboardingRecord>
   - getChecklist(offboardingId): ChecklistItem[]
   - completeChecklistItem(offboardingId, itemId, completedBy, evidence?): void
   - finalizeOffboarding(offboardingId, finalSettlementApprover): Promise<EvidencePack>
     - Generates EP-WOS-OFFBOARD-01 including:
       notice record, all approvals, handover task completions,
       ESB calculation (if applicable), final settlement checklist items

2. Default offboarding checklist items (configurable per tenant):
   - Notice period acknowledgement (signed by employee)
   - Knowledge handover tasks (assigned + completed)
   - Asset return (laptop, access cards, etc.)
   - System access revocation request
   - Final payroll confirmation
   - ESB calculation review and approval
   - Reference letter issued (optional)
   - Exit interview completed (optional)

3. Create /src/components/offboarding/OffboardingChecklist.tsx
   - Timeline view of checklist items
   - Each item: assignee, due date, status, completion evidence upload
   - Red items: overdue
   - Finalize button: enabled only when all required items COMPLETED
   - Generates EP-WOS-OFFBOARD-01 on finalization

CONSTRAINTS:
- Finalization requires all mandatory checklist items COMPLETED
- HR approval required for finalization (human-only)
- ESB calculation must be included in evidence pack if applicable
- Offboarding cannot be reversed once finalized (terminal state)

EVIDENCE COMMANDS:
npm run test:offboarding-workflow
# Must cover: checklist completion, finalization gate,
# evidence pack generation

DELIVER:
- All TypeScript source files (full content)
- Tests: minimum 15 test cases
```

---

### S38-G6 — KSA PDPL Compliance (DPIA + SCCs + DSR Portal)

```
GATE ID:   S38-G6
BRD REF:   Maqaleed eval §Regional compliance, Maqaleed BRD eval PDF §2
STATUS:    OPEN
```

**Claude Code Prompt — paste exactly:**

```
Activate Project Master Mode.
Reference: Maqaleed eval §Regional compliance (KSA PDPL + UAE PDPL).

BASELINE:
No DPIA template, no SCCs, no DSR portal, no DPO documentation.
Investor due diligence and enterprise procurement both require these
before any Saudi or UAE enterprise client can be contracted.

TARGET:
Implement PDPL compliance infrastructure:

1. Create /src/pages/admin/DataPrivacyPortal.tsx
   Route: /admin/data-privacy

   SECTION A — Data Subject Request (DSR) Portal
   - Form: request type (ACCESS | RECTIFICATION | ERASURE | PORTABILITY | OBJECTION)
   - Subject identity verification step
   - Request logging with 30-day SLA countdown
   - Status tracking for requesting subjects
   - Admin view: all pending DSRs with SLA countdown badges

2. Create /src/services/compliance/pdpl.ts
   - PDPLComplianceService class
   - submitDSR(request: DSRRequest): Promise<DSRRecord>
   - processDSR(dsrId, response): Promise<void>
   - getLawfulBasisRegistry(): LawfulBasisEntry[]
     Registry: for each data collection point → lawful basis (CONTRACT | CONSENT | LEGITIMATE_INTEREST)
   - generateTransferRiskAssessment(dataFlow: DataFlow): TRADocument

3. Create /src/config/compliance/pdpl-lawful-basis-registry.json
   - Maps each data field/collection point to its lawful basis
   - Includes KSA PDPL + UAE PDPL coverage
   - Version controlled

4. Create /src/docs/compliance/ (static documents, accessible via /admin/data-privacy)
   - DPIA_TEMPLATE_v1.md — Data Protection Impact Assessment template
     pre-filled with platform architecture data flows
   - SCCs_TEMPLATE_v1.md — Standard Contractual Clauses template
     for cross-border transfers to/from KSA
   - DPO_APPOINTMENT_RECORD.md — DPO appointment documentation template
   - DATA_RESIDENCY_DECLARATION.md — data residency statement for enterprise clients

5. Create /src/db/migrations/YYYYMMDD_create_dsr_records.sql
   - Table: dsr_records with SLA tracking
   - RLS: tenant isolation

CONSTRAINTS:
- DSR SLA: 30 days from submission (per KSA PDPL) — alert at day 25
- All DSR actions immutably logged
- DPIA and SCC documents must be downloadable by enterprise clients
- Lawful basis registry must be complete before go-live

EVIDENCE COMMANDS:
npm run test:pdpl-compliance
# Must cover: DSR submission, SLA tracking, lawful basis completeness

DELIVER:
- All TypeScript source files (full content)
- /src/config/compliance/pdpl-lawful-basis-registry.json (complete)
- /src/docs/compliance/ (all 4 template documents)
- /src/db/migrations/ for DSR records
- Tests: minimum 12 test cases
```

---

### S38-G7 — S38 Closure: Evidence Pack EP-WOS-OFFBOARD-01

```
GATE ID:   S38-G7
TYPE:      Manual closure — human-only
```

**Closure Checklist:**
```
[ ] S38-G1: PSP adapter sandbox tests PASS for Tap + HyperPay
[ ] S38-G2: Evidence Pack immutability confirmed — 0 null hashes in DB
[ ] S38-G3: /evidence screen export SLA test: ≤60s confirmed
[ ] S38-G4: ESB Calculator — all tenure bracket tests PASS
[ ] S38-G5: Offboarding workflow + EP-WOS-OFFBOARD-01 sample generated
[ ] S38-G6: DSR portal live — DPIA + SCCs downloadable from /admin/data-privacy
[ ] All PRs merged under branch protection
[ ] Notion S38 program node updated
```

---

## SPRINT S39 — SDP + COMPLIANCE UX + GTM EXIT

```
Sprint:    S39
Objective: Deploy Seasonal Delivery Programs, WCAG enforcement, and closed beta exit
Gates:     S39-G1 through S39-G7
BRD Refs:  Gold BRD A5, A8, RT-1 §7.3–7.6, Maqaleed eval §GTM
Dependency: S38 FULLY CLOSED
```

---

### S39-G1 — Seasonal Delivery Programs (SDP) Core

```
GATE ID:   S39-G1
BRD REF:   Gold BRD A5, RT-1 §7.3–7.6, Consolidated §4
STATUS:    OPEN
```

**Claude Code Prompt — paste exactly:**

```
Activate Project Master Mode.
Reference: Gold BRD A5, RT-1 §7.3–7.6, Consolidated §4.

BASELINE:
No SDP module exists. The Hajj/World Cup/Expo delivery program capability —
the platform's unique demand-capture opportunity — has no deployed code.
This is a Phase 1 binding requirement.

TARGET:
Implement Seasonal Delivery Programs (SDP) core:

1. Create /src/services/sdp/seasonalDeliveryProgram.ts
   - SDPService class
   - createProgram(params: SDPParams): Promise<SDPProgram>
     Params: { name, objective, startDate, endDate, budgetEnvelope,
               capacityLimit, programType, complianceFlags }
   - activateProgram(programId, approver): Promise<void>
   - getStatus(programId): SDPStatus

2. SDP Program schema:
   - id, name, programType (HAJJ | UMRAH | SPORTS_EVENT | EXPO | GOVERNMENT_SURGE | CUSTOM)
   - timeBox: { startDate, endDate } — BOTH required (time-boxed is mandatory)
   - capacityLimit (max workers)
   - budgetEnvelope: { allocated, committed, actual }
   - status: DRAFT | ACTIVE | PAUSED | COMPLETED
   - Non-employment safeguards: enforced by schema (no shift fields, no attendance fields)
   - Independently auditable: full audit log per program

3. Create /src/services/sdp/surgePodTemplates.ts
   - Pre-defined pod templates for rapid assembly:
     EVENT_MEDIA_POD: { roles: [VideoProducer, Photographer, SocialMediaManager],
       skills, durationDays: 14, deliveryArtifacts, complianceNotes }
     MULTILINGUAL_SUPPORT_POD: { roles: [ARSpeaker, ENSpeaker, URSpeaker],
       skills, durationDays: variable }
     DIGITAL_OPERATIONS_POD: { roles: [ITSupport, DataAnalyst, PMO],
       skills, durationDays: variable }
     ANALYTICS_MONITORING_POD: { roles: [DataEngineer, BIAnalyst, Monitoring],
       skills }
     CYBERSECURITY_SOC_POD: { roles: [SecurityAnalyst, SOCAnalyst, IncidentResponder],
       skills }
   - instantiateTemplate(templateId, programId, customizations): Pod

4. Create /src/services/sdp/bulkOperations.ts
   - bulkImportJobs(csv: Buffer, programId): Promise<BulkImportResult>
     Validates: mandatory matching criteria per program type, compliance flags
     Returns: { imported, failed, validationErrors }
   - bulkOnboardFreelancers(csv: Buffer, programId): Promise<BulkOnboardResult>
   - Both operations: validate before import — no partial imports on critical errors

5. Create /src/pages/sdp/SDPWorkspace.tsx
   Route: /programs/:programId
   - Program header: name, timeline, budget bar (allocated vs committed vs actual)
   - Pod grid: all pods with fill %, milestone progress, risk indicators
   - Quick assembly: "Add pod from template" → surge pod templates
   - Bulk operations: upload CSV for jobs or freelancers
   - Program compliance panel: non-employment safeguards status (all green required)
   - Independently auditable: link to evidence pack for program

CONSTRAINTS (NON-NEGOTIABLE per Gold BRD A5):
- SDP programs are time-boxed — start AND end dates mandatory
- Only outcome-based delivery windows — NO shift scheduling fields
- NO attendance tracking fields in any SDP model
- NO exclusivity requirements in any SDP contract
- Capacity limit enforced at program level — cannot over-subscribe
- All worker engagements within SDP are independent contractor only

EVIDENCE COMMANDS:
npm run test:sdp-service
# Must cover: time-box enforcement, capacity limits,
# non-employment safeguard validation (reject any shift/attendance field attempt)

npm run test:surge-pod-templates
npm run test:bulk-operations

DELIVER:
- All TypeScript source files (full content)
- /src/db/migrations/YYYYMMDD_create_sdp_programs.sql
- /src/config/sdp/surge-pod-templates-v1.json
- Tests: minimum 20 test cases for SDPService,
         minimum 12 for bulk operations (including validation failure cases)
```

---

### S39-G2 — WCAG 2.2 AA CI Enforcement

```
GATE ID:   S39-G2
BRD REF:   Gold BRD A6, Maqaleed eval §Technical
STATUS:    OPEN
```

**Claude Code Prompt — paste exactly:**

```
Activate Project Master Mode.
Reference: Gold BRD A6, Maqaleed eval §Technical (WCAG 2.2 AA).

BASELINE:
WCAG 2.2 AA is specified but no CI enforcement exists. No confirmed test
coverage. New WCAG 2.2 criteria (Focus Appearance, Target Size 24x24px)
not verified.

TARGET:
Implement CI-enforced WCAG 2.2 AA compliance:

1. Install and configure accessibility testing:
   npm install --save-dev @axe-core/playwright playwright

2. Create /scripts/a11y/run-wcag-audit.js
   - Crawls all routes: /, /ai, /workforce, /compliance, /evidence,
     /payments, /admin, /programs, /identity
   - Runs axe-core with WCAG 2.2 AA ruleset on each page
   - Reports: violations by page, severity, rule ID, element selector
   - EXIT CODE 1 if ANY page has critical violations
   - EXIT CODE 0 only if all pages pass at AA level
   - Outputs: /reports/accessibility/a11y-report-{date}.json

3. WCAG 2.2 specific checks (new criteria):
   - Focus Appearance (2.4.11): focus ring must have minimum 3:1 contrast ratio
     against adjacent colors AND minimum 2px perimeter
     Fix: ensure all interactive elements have visible focus ring
   - Target Size (2.5.8): all interactive targets minimum 24x24px
     Fix: audit all buttons, links, icons — minimum 44x44px for touch targets
   - Dragging (2.5.7): any drag operation must have pointer-event alternative
   - Consistent Help (3.2.6): help mechanism consistent across pages

4. Fix all violations found during audit:
   - For each critical/serious violation: fix the component
   - Document each fix with: element, violation, fix applied
   - Re-run audit to confirm 0 critical violations

5. Update CI pipeline:
   Add step: "WCAG 2.2 AA Audit" → runs run-wcag-audit.js
   Step runs AFTER build, BEFORE deploy
   Gate: build fails if pass rate < 95% of pages (0 critical violations on ≥95% of pages)
   Comment: "# BRD A6 + Maqaleed Eval: WCAG 2.2 AA CI enforcement"

6. Create /src/styles/accessibility.css
   - Global focus ring styles (visible, high contrast)
   - Minimum target size utilities
   - Skip navigation link (for screen readers)

CONSTRAINTS:
- 95% page pass rate minimum — not 100% target initially, but this is the floor
- New WCAG 2.2 criteria (Focus Appearance, Target Size) must be explicitly tested
- All fix PRs must include re-audit confirmation (before/after screenshots)
- CI gate blocks deploys — this is non-negotiable

EVIDENCE COMMANDS:
node scripts/a11y/run-wcag-audit.js
# Attach: full audit report JSON + summary (violations per page)
# Target: 0 critical violations on all 9 routes

DELIVER:
- /scripts/a11y/run-wcag-audit.js (full content)
- /src/styles/accessibility.css (full content)
- Updated CI configuration with WCAG gate
- Accessibility audit report (before fixes + after fixes)
- Fix log: list of all violations found and remediated
```

---

### S39-G3 — Core Web Vitals CI Budget + Performance Gate

```
GATE ID:   S39-G3
BRD REF:   Maqaleed eval §Technical (CWV budget in CI)
STATUS:    OPEN
```

**Claude Code Prompt — paste exactly:**

```
Activate Project Master Mode.
Reference: Maqaleed BRD eval §Technical, WorkCaptain Eval §3.2 (CWV).

BASELINE:
No Core Web Vitals budget enforcement in CI. No p75 pass rate tracking.
Lighthouse is run manually if at all. Performance regressions can ship undetected.

TARGET:
Implement CWV CI budget enforcement:

1. Create /scripts/performance/run-cwv-audit.js
   - Runs Lighthouse on critical routes: /, /ai, /workforce, /compliance
   - Metrics tracked: LCP (Largest Contentful Paint), FID/INP, CLS, FCP, TTFB
   - Thresholds (p75):
     LCP: ≤2.5s (GOOD), fail if >4s
     INP: ≤200ms (GOOD), fail if >500ms
     CLS: ≤0.1 (GOOD), fail if >0.25
   - EXIT CODE 1 if any critical route fails threshold
   - Outputs: /reports/performance/cwv-report-{date}.json

2. Update CI pipeline:
   Add step: "Core Web Vitals Budget" → runs run-cwv-audit.js
   Gate: blocks deploy if p75 LCP >4s on any critical route
   Comment: "# Maqaleed Eval: CWV p75 pass rate >=85% required"

3. Performance budget file: /src/performance-budget.json
   - Defines budgets per route
   - Tracked in version control — changes require PR review

EVIDENCE COMMANDS:
node scripts/performance/run-cwv-audit.js
# Attach: CWV report for all 4 critical routes

DELIVER:
- /scripts/performance/run-cwv-audit.js (full content)
- /src/performance-budget.json
- Updated CI configuration
- Initial CWV audit report (current baseline)
```

---

### S39-G4 — Fee Transparency UX + Payout Matrix Display

```
GATE ID:   S39-G4
BRD REF:   Maqaleed eval §Pricing, WorkCaptain Eval §5.3
STATUS:    OPEN
```

**Claude Code Prompt — paste exactly:**

```
Activate Project Master Mode.
Reference: Maqaleed eval §Pricing, WorkCaptain Eval §5.3.

BASELINE:
No fee calculator widget on job post or offer screens. No one-screen
fee disclosure before payment commitment. 0% freelancer commission
is not explained at every touchpoint. No payout ETA badge.

TARGET:
Implement fee transparency and payout clarity UX:

1. Create /src/components/payments/FeeCalculator.tsx
   - Embedded on: job post screen, offer builder, contract confirmation
   - Shows before any payment commitment:
     Client side: platform fee + payment method uplift + instant payout surcharge (if opted)
     Freelancer side: 0% commission (highlighted) + withdrawal fees + currency conversion
   - Dynamic: updates as payment method changes
   - "What changes, when" notice: "Competitor fees change frequently. Ours don't."
   - All math on one screen — not split across pages

2. Create /src/components/payments/PayoutETABadge.tsx
   - Shows per method: ETA, fees, currency, cut-off time, failure handling
   - Data from /api/payments/payout-matrix (S38-G1)
   - Displayed on: contract screen, earnings screen
   - Arabic + English labels

3. Update job post and offer screens to include FeeCalculator
4. Update contract confirmation screen: FeeCalculator must be visible before confirm button

CONSTRAINTS:
- 0% freelancer commission badge must appear on every offer/contract screen
- Fee math must be complete (no hidden fees) before commitment
- One-screen disclosure is non-negotiable per Maqaleed eval

EVIDENCE COMMANDS:
npm run test:fee-calculator
npm run test:payout-eta-badge

DELIVER:
- All TypeScript source files (full content)
- Tests: minimum 10 test cases
- Screenshot: fee calculator on offer screen
```

---

### S39-G5 — Work Identity / ERI Score (Full Deployment)

```
GATE ID:   S39-G5
BRD REF:   WorkCaptain Eval §3.1 (/identity screen)
STATUS:    OPEN (partial from S32-S35 runway)
```

**Claude Code Prompt — paste exactly:**

```
Activate Project Master Mode.
Reference: WorkCaptain Eval §3.1 (/identity screen, P1).

BASELINE:
Work Identity layer exists (from S32-S35) but /identity screen is not
fully deployed. ERI score may not be visible or explainable in UI.
Verified project history and tokens are not surfaced to employers.

TARGET:
Complete Work Identity deployment:

1. Verify /src/pages/identity/WorkIdentityScreen.tsx exists and is complete
   Route: /identity
   Required elements:
   - ERI (Employment Reliability Index) score: large display, gauge, interpretation label
   - Score components breakdown: on-time delivery %, dispute rate, rehire rate,
     responsiveness score, platform tenure
   - Verified project history: list of completed projects with verification badges
   - Identity tokens: earned badges (e.g., "Verified Expert", "SDP Veteran",
     "Zero Disputes", "Top 10% Delivery")
   - ERI trend: 6-month chart
   - Share/export: generate a shareable Work Identity profile (link or PDF)
   - Arabic RTL layout for all content

2. If screen exists but is incomplete — implement missing sections above
3. If screen is missing — build it from scratch per the above spec

4. Employer-facing: when viewing candidate profile, show ERI score card
   with: score, interpretation, top 3 signals
   (Full /identity is the worker's own view — employer sees summary card only)

EVIDENCE COMMANDS:
npm run test:work-identity-screen
# Attach: screenshot of /identity with ERI gauge + project history

DELIVER:
- Completed /src/pages/identity/WorkIdentityScreen.tsx
- Tests: minimum 10 test cases
- Screenshot of completed screen
```

---

### S39-G6 — Closed Beta Configuration + GTM Exit Criteria

```
GATE ID:   S39-G6
BRD REF:   WorkCaptain Eval §9.4, Maqaleed eval §GTM
STATUS:    OPEN
```

**Claude Code Prompt — paste exactly:**

```
Activate Project Master Mode.
Reference: WorkCaptain Eval §9.4 (closed beta), Maqaleed eval §GTM exit criteria.

BASELINE:
No beta access control, no GTM instrumentation, no exit criteria monitoring.
Cannot run a structured closed beta without these.

TARGET:
Implement closed beta infrastructure:

1. Create /src/services/beta/betaAccessControl.ts
   - BetaAccessService class
   - inviteUser(email, role: 'EMPLOYER' | 'FREELANCER' | 'FTE', tier: 'BETA')
   - validateBetaAccess(userId): BetaAccess
   - getBetaStats(): { employers, freelancers, fteAccounts, activeSessions }
   - Limits: max 50 employers, 200 freelancers, 10 FTE accounts

2. Create /src/services/analytics/gtmInstrumentation.ts
   - KPI tracking for exit criteria:
     timeToFirstProposal: median time from job post to first proposal received
     matchRate: proposals that convert to contract / total proposals
     payoutETABreaches: payout SLA exceeded / total payouts
     accessibilityPassRate: pages passing WCAG 2.2 AA / total pages
   - track(event: GTMEvent): void
   - getExitCriteriaStatus(): ExitCriteria
     Returns: { allMet: boolean, criteria: ExitCriterionStatus[] }

3. Create /src/pages/admin/BetaDashboard.tsx
   Route: /admin/beta
   - Beta user counts (vs limits)
   - Exit criteria scorecard:
     [ ] p75 time-to-first-proposal ≤4h (current: ?)
     [ ] Match rate ≥45% (current: ?)
     [ ] Payout ETA breaches <1% (current: ?)
     [ ] Accessibility AA pass rate ≥95% pages (current: ?)
   - RAG status per criterion
   - "Request CEO Exit Review" button (enabled only when all criteria GREEN)

4. Create /src/db/migrations/YYYYMMDD_create_beta_access.sql
   - Tables: beta_invitations, beta_access_records, gtm_events
   - RLS enforced

EVIDENCE COMMANDS:
npm run test:beta-access-control
npm run test:gtm-instrumentation

DELIVER:
- All TypeScript source files (full content)
- Database migrations
- Tests: minimum 12 test cases
- /admin/beta screen screenshot
```

---

### S39-G7 — CEO EXIT GATE: Full S36–S39 Verification

```
GATE ID:   S39-G7
TYPE:      HUMAN-ONLY APPROVAL — CEO authorization required
BRD REF:   AI Execution Strategy §IV (S35-G5 equivalent)
```

**This gate cannot be closed by any AI tool. CEO must personally verify and sign off.**

**Pre-Exit Verification Checklist:**

```
SOVEREIGN COMPLIANCE LAYER
[ ] Nitaqat Impact Preview: live, tested, Arabic explanation present
[ ] Occupation Code AI Matching: live, prohibited title blocking confirmed
[ ] WPS Readiness Pack: live, IBAN hashed, evidence pack generates automatically
[ ] Probation Governance: Day-80 automation confirmed running, decision workflow live
[ ] Qiwa Contract Mirroring: all 6 state transitions tested and PASS
[ ] Compensation Transparency: offer builder enforces breakdown, GOSI disclaimer present
[ ] ESB Calculator: versioned policy engine live, calculation stored as evidence
[ ] Compliance & Risk Screen: Nitaqat zone visible, WPS table live, probation deadlines showing

AI GOVERNANCE
[ ] /ai screen: RecommendationAuditLog surface live with approve/reject
[ ] Explainability cards: confidence scores, input signals, rationale visible
[ ] Bias monitoring: bias score present in audit log entries
[ ] AI never auto-approves: verified by attempting to bypass approval — blocked
[ ] Audit log export: JSON export available and regulator-ready

EVIDENCE FABRIC
[ ] /evidence screen: EP library visible, viewer working, export functional
[ ] Export SLA: ≤60s confirmed for single pack export
[ ] Immutability: 0 null hashes in recommendation_audit_logs and evidence_packs
[ ] All 5 EP pack types deployed: RECRUIT-01, HIRE-01, ONBOARD-01, PROB-01, OFFBOARD-01

PAYMENTS & FINANCIAL
[ ] Tap adapter: sandbox tests PASS
[ ] HyperPay adapter: sandbox tests PASS
[ ] PSP routing matrix: KSA buyer → Tap routing confirmed
[ ] Fee calculator: visible on offer screen before commitment
[ ] Payout ETA badge: accurate and displayed on contract screen
[ ] 0% freelancer commission: visible and explained at every touchpoint

MULTILINGUAL / ACCESSIBILITY
[ ] AR translation check-translations.js: EXIT 0 confirmed (no missing keys)
[ ] RTL layout: Arabic renders correctly on all sovereign screens
[ ] Tier-2 languages: structurally present (ur, fr, es) but feature-flagged off
[ ] WCAG 2.2 AA: CI audit reports ≥95% page pass rate
[ ] CWV: LCP ≤2.5s on critical routes confirmed

SDP
[ ] SDP Program Workspace: time-boxed program creation working
[ ] Surge pod templates: at least 3 templates instantiable
[ ] Bulk import: CSV import for jobs tested (validation PASS + FAIL cases)
[ ] Non-employment safeguards: no shift/attendance fields possible in SDP

LEGAL / DATA PRIVACY
[ ] DSR portal: /admin/data-privacy live, form submits and logs
[ ] DPIA template: downloadable from /admin/data-privacy
[ ] SCCs template: downloadable
[ ] Lawful basis registry: complete JSON in /src/config/compliance/

COMMAND CENTER
[ ] KPI strip: all 4 KPIs populated on first load
[ ] Risk board: entity risk indicators showing across People/Projects/Compliance
[ ] Quick actions: all 5 actions functional

BETA & GTM
[ ] Beta access control: 50/200/10 limits enforced
[ ] Exit criteria dashboard: /admin/beta live and showing real data
[ ] All 4 exit criteria status: visible (p75 proposal ≤4h, match ≥45%,
    payout breaches <1%, accessibility ≥95%)

GOVERNANCE
[ ] All S36–S39 Notion gates: CLOSED/PASS
[ ] All PRs merged: branch protection with required reviews confirmed
[ ] No CRITICAL BRD compliance items remaining RED
[ ] Evidence packs: attached to all 28 gates in Notion
```

**CEO Approval Statement (sign and commit to PROWORK_ROOT/FND/):**

```
SOVEREIGN ACTIVATION RUNWAY: S36–S39
STATUS: [APPROVED / NOT APPROVED]
Date: _______________
Approved by: Waheeb Mahmoud
Signature: _______________

Notes:
_______________________________________________

This approval authorizes transition from CLOSED BETA to MARKET LAUNCH.
```

---

## APPENDIX A — BRD COMPLIANCE DELTA (Post S36–S39)

```
After S36–S39 completion, expected compliance scores:

Domain                  Before S32-S35   After S35   After S39 (target)
─────────────────────── ─────────────── ─────────── ──────────────────
BRD Compliance          ~65%             ~78%         ~95%
KSA Sovereign Layer     ~25%             ~28%         ~90%
AI Governance           ~35%             ~55%         ~92%
Trust & Evidence        ~30%             ~62%         ~95%
UX Maturity             ~45%             ~58%         ~85%
Payment & Escrow        ~70%             ~88%         ~95%
Multilingual / RTL      ~50%             ~60%         ~95%
Accessibility WCAG 2.2  ~40%             ~52%         ~95%
Work Identity / ERI     ~20%             ~65%         ~90%
Overall Platform        ~48%             ~72%         ~92%
```

---

## APPENDIX B — HARD GOVERNANCE RULES (NON-NEGOTIABLE)

```
1. No AI tool may auto-close any gate in S36–S39.
2. Human closure required for all G7 gates in each sprint.
3. S39-G7 CEO Exit Gate: human-only approval. No exceptions.
4. Evidence commands must be run and output attached BEFORE gate is marked DONE.
5. No schema changes to recommendation_audit_logs or evidence_packs
   after S36-G2 is closed. Treat as frozen.
6. Policy config assets (nitaqat, compensation, ESB, PDPL) are versioned files.
   Regulatory updates update the config, not the code.
7. All AI outputs (including this plan) are governed by the tri-layer model:
   ChatGPT (Architect) → Claude Code (Executor) → Emergent (Prototype only)
   This document is the architecture layer. Claude Code executes it.
   No deviation without a documented decision and formal approval.
```

---

*Document ends. Total gates: 28 (S36-G1 through S39-G7).*
*Commit to: /PROWORK_ROOT/EXECUTION/RECOVERY/SOVEREIGN_ACTIVATION_RUNWAY.md*
*Authority: Waheeb Mahmoud*
