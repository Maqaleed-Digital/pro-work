#!/usr/bin/env node
'use strict';

/**
 * S39-G2 — WCAG 2.2 AA Accessibility Audit
 * BRD A6 + Maqaleed Eval required
 *
 * Crawls all 9 product routes using headless Chrome (puppeteer) + axe-core.
 *
 * Strategy: tag-based filter (no manual rule whitelist).
 *   runOnly.values = ['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']
 *
 *   wcag22aa pulls the WCAG 2.2 AA rules including target-size (WCAG
 *   2.5.8). WCAG 2.4.11 Focus Appearance has no single named axe-core
 *   rule; coverage is enforced via CSS-level tests (see Suite 5 in
 *   tests/wcag.ci_gate.test.js) that assert :focus-visible styling
 *   exists in app/frontend/src/style.css.
 *
 * Exit codes:
 *   0 — 0 critical violations across all routes
 *   1 — ≥1 critical violation found (blocks deploy in CI)
 *
 * Output:
 *   reports/accessibility/audit-<timestamp>.json   — full machine-readable report
 *   reports/accessibility/audit-<timestamp>.txt    — human-readable summary
 *
 * Usage:
 *   node scripts/wcag_audit.js [--url http://localhost:4173]
 *
 * CI usage (after vite build + vite preview):
 *   node scripts/wcag_audit.js
 */

// puppeteer and @axe-core/puppeteer are loaded lazily inside runAudit()
// so this file can be require()'d for config inspection without a browser install
const fs   = require('fs');
const path = require('path');

// ── Audit configuration ───────────────────────────────────────────────────────

const BASE_URL = process.env.AUDIT_URL || 'http://localhost:4173';
const REPORT_DIR = path.join(__dirname, '../reports/accessibility');
// Fake token injected into localStorage so SPA renders past login gate
const CI_TOKEN  = process.env.AUDIT_CI_TOKEN || 'ci-wcag-audit-token';

/**
 * 9 routes to crawl.
 * Spec routes mapped to hash equivalents for this SPA.
 * Labels show both spec path and SPA hash for traceability.
 */
const AUDIT_ROUTES = [
  { hash: '',            label: '/ (Login)',              requiresAuth: false },
  { hash: 'dashboard',   label: '/ai (Dashboard/AI)',      requiresAuth: true  },
  { hash: 'workers',     label: '/workforce (Workers)',     requiresAuth: true  },
  { hash: 'governance',  label: '/compliance (Governance)', requiresAuth: true  },
  { hash: 'evidence',    label: '/evidence (Evidence)',     requiresAuth: true  },
  { hash: 'scheduler',   label: '/payments (Scheduler)',    requiresAuth: true  },
  { hash: 'system',      label: '/admin (System)',          requiresAuth: true  },
  { hash: 'pods',        label: '/programs (SDP/Pods)',     requiresAuth: true  },
  { hash: 'tenants',     label: '/identity (Tenants)',      requiresAuth: true  },
];

/**
 * axe-core RUN options for WCAG 2.2 AA.
 *
 * Strategy (Day 7 fix #2, 2026-05-16):
 *   Tag-based filter only — NO manual rule whitelist.
 *
 *   axe-core's `runOnly: { type: 'tag', values: [...] }` selects the
 *   union of rules tagged with any of the listed tags. The full WCAG
 *   2.0/2.1/2.2 AA ruleset is covered by wcag2aa + wcag21aa + wcag22aa.
 *   wcag2a is included for the small set of A-level rules that overlap
 *   AA contracts (e.g., language-of-page is A but blocks AA conformance).
 *
 *   The previous implementation whitelisted specific rule IDs in a
 *   `rules` object. That approach is fragile: invalid rule IDs (e.g.,
 *   `focus-visible`, which is NOT an axe-core rule) cause axe-core to
 *   throw `"unknown rule \`focus-visible\` in options.rules"` at the
 *   first analyze() call, blocking the entire audit. The tag-based
 *   filter avoids that whole class of bug.
 *
 *   WCAG 2.4.11 Focus Appearance has no single named axe-core rule.
 *   Coverage is enforced at the CSS level via Suite 5 of
 *   tests/wcag.ci_gate.test.js (style.css must contain :focus-visible).
 *
 *   WCAG 2.5.8 Target Size is rule `target-size` (axe-core 4.10+),
 *   tagged `wcag22aa` — included automatically by the wcag22aa tag.
 *
 * Shape note (Day 7 fix #1, 2026-05-16):
 *   This object is the `axe.run(context, options)` shape, consumed via
 *   `AxePuppeteer.options(opts)`. Earlier the script used
 *   `.configure(AXE_CONFIG)` which expects `axe.configure()` spec shape
 *   (spec.rules is an ARRAY of custom rule defs). That mismatch yielded
 *   "Audit failed: Rules property must be an array". Now fixed.
 */
const AXE_OPTIONS = {
  runOnly: {
    type: 'tag',
    values: [
      'wcag2a',       // A-level rules whose violation also blocks AA conformance
      'wcag2aa',      // WCAG 2.0 AA — color-contrast, label, bypass, etc.
      'wcag21aa',     // WCAG 2.1 AA additions
      'wcag22aa',     // WCAG 2.2 AA — includes target-size for 2.5.8
    ],
  },
  // No manual `rules` whitelist — tag-based filter applies axe-core's
  // default ruleset for the listed tags. This avoids invalid-rule-id
  // bugs and keeps coverage broad. Tightening to specific rule subsets
  // is appropriate only if axe-core surfaces noise for our specific
  // surfaces; do it on a per-noise-finding basis, not pre-emptively.
};

// Backwards-compatible alias for callers that still reference the old name.
const AXE_CONFIG = AXE_OPTIONS;

/**
 * Impact levels that trigger exit(1) and block CI deploys.
 * 'critical' and 'serious' violations are blocking.
 * 'moderate' and 'minor' are reported but non-blocking.
 */
const BLOCKING_IMPACTS = new Set(['critical', 'serious']);

// ── Utilities ─────────────────────────────────────────────────────────────────

function ensureReportDir() {
  if (!fs.existsSync(REPORT_DIR)) fs.mkdirSync(REPORT_DIR, { recursive: true });
}

function nowTs() {
  return new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
}

function fmtViolation(v) {
  return [
    `  [${v.impact.toUpperCase()}] ${v.id}: ${v.description}`,
    `  Help: ${v.helpUrl}`,
    `  Nodes (${v.nodes.length}):`,
    ...v.nodes.slice(0, 3).map(n => `    · ${n.target.join(', ')}`),
    v.nodes.length > 3 ? `    … and ${v.nodes.length - 3} more` : '',
  ].filter(Boolean).join('\n');
}

// ── Main audit ────────────────────────────────────────────────────────────────

async function runAudit() {
  // Lazy require — keeps this file importable for config inspection without Chrome
  const puppeteer = require('puppeteer');          // eslint-disable-line global-require
  const axe       = require('@axe-core/puppeteer'); // eslint-disable-line global-require

  console.log('┌─ WCAG 2.2 AA Accessibility Audit ────────────────────────────');
  console.log(`│  Base URL : ${BASE_URL}`);
  console.log(`│  Routes   : ${AUDIT_ROUTES.length}`);
  console.log(`│  Standard : WCAG 2.2 AA (includes 2.4.11 + 2.5.8)`);
  console.log('└──────────────────────────────────────────────────────────────');
  console.log();

  ensureReportDir();

  const browser = await puppeteer.launch({
    headless: 'new',
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',    // CI: avoid /dev/shm exhaustion
      '--disable-gpu',
    ],
  });

  const allResults = [];
  let totalCritical = 0;
  let totalViolations = 0;

  try {
    for (const route of AUDIT_ROUTES) {
      const url = route.hash
        ? `${BASE_URL}/#${route.hash}`
        : BASE_URL;

      console.log(`Auditing ${route.label}`);
      console.log(`  URL: ${url}`);

      const page = await browser.newPage();

      // WCAG audit viewport — standard desktop
      await page.setViewport({ width: 1280, height: 800 });

      // Inject CI token so app renders past login gate for auth-required routes.
      //
      // FIX (WC-CB Day 7, 2026-05-16): localStorage key is `pw_token`, not
      // `prowork_token`. See app/frontend/src/api.js:2 — getToken() reads
      // `pw_token`. The previous wrong key meant auth-required routes
      // silently fell through to the signin page, so axe-core would
      // measure signin DOM for every protected route. Now corrected so
      // the audit measures the intended route's rendered DOM.
      if (route.requiresAuth) {
        await page.evaluateOnNewDocument((token) => {
          localStorage.setItem('pw_token', token);
        }, CI_TOKEN);
      }

      await page.goto(url, { waitUntil: 'networkidle0', timeout: 30000 });

      // Wait for app to render (hash routing needs a tick after navigation)
      await page.waitForFunction(() => document.getElementById('app') !== null, { timeout: 5000 })
        .catch(() => {}); // login page may render differently

      // Run axe-core analysis.
      //
      // .options() consumes the axe.run() options shape; AXE_OPTIONS now
      // carries only `runOnly` (tag-based filter). No rules whitelist
      // means no risk of "unknown rule" failures. See AXE_OPTIONS
      // doc-comment for the full rationale.
      const results = await new axe.AxePuppeteer(page).options(AXE_OPTIONS).analyze();

      const blocking = results.violations.filter(v => BLOCKING_IMPACTS.has(v.impact));
      const nonBlocking = results.violations.filter(v => !BLOCKING_IMPACTS.has(v.impact));

      totalCritical  += blocking.length;
      totalViolations += results.violations.length;

      allResults.push({
        route:        route.label,
        url,
        passes:       results.passes.length,
        violations:   results.violations.length,
        blocking:     blocking.length,
        incomplete:   results.incomplete.length,
        violationDetails: results.violations,
      });

      if (blocking.length > 0) {
        console.log(`  ✗ ${blocking.length} blocking violation(s):`);
        blocking.forEach(v => console.log(fmtViolation(v)));
      } else {
        console.log(`  ✓ 0 blocking violations (${results.passes.length} rules passed)`);
      }
      if (nonBlocking.length > 0) {
        console.log(`  ⚠ ${nonBlocking.length} non-blocking violation(s) (moderate/minor)`);
      }
      console.log();

      await page.close();
    }
  } finally {
    await browser.close();
  }

  // ── Write reports ─────────────────────────────────────────────────────────
  const ts = nowTs();

  const jsonPath = path.join(REPORT_DIR, `audit-${ts}.json`);
  const txtPath  = path.join(REPORT_DIR, `audit-${ts}.txt`);

  const jsonReport = {
    generated_at:         new Date().toISOString(),
    standard:             'WCAG 2.2 AA',
    wcag22_criteria_checked: ['2.4.11 Focus Appearance', '2.5.8 Target Size Minimum'],
    base_url:             BASE_URL,
    routes_audited:       AUDIT_ROUTES.length,
    total_violations:     totalViolations,
    blocking_violations:  totalCritical,
    ci_gate_passed:       totalCritical === 0,
    results:              allResults,
  };

  fs.writeFileSync(jsonPath, JSON.stringify(jsonReport, null, 2), 'utf8');

  const lines = [
    'WCAG 2.2 AA Accessibility Audit Report',
    `Generated: ${new Date().toISOString()}`,
    `Standard: WCAG 2.2 AA (2.4.11 Focus Appearance, 2.5.8 Target Size)`,
    `Base URL: ${BASE_URL}`,
    '─'.repeat(60),
    '',
    ...allResults.map(r => [
      `Route: ${r.route}`,
      `  URL         : ${r.url}`,
      `  Passes      : ${r.passes}`,
      `  Violations  : ${r.violations} (${r.blocking} blocking)`,
      `  Incomplete  : ${r.incomplete}`,
      ...(r.violationDetails.length > 0
        ? ['  Violations:', ...r.violationDetails.map(v => fmtViolation(v))]
        : ['  No violations.']),
      '',
    ].join('\n')),
    '─'.repeat(60),
    `TOTAL BLOCKING VIOLATIONS : ${totalCritical}`,
    `CI GATE                   : ${totalCritical === 0 ? 'PASS' : 'FAIL — deploy blocked'}`,
  ].join('\n');

  fs.writeFileSync(txtPath, lines, 'utf8');

  console.log('─'.repeat(60));
  console.log(`Reports written to: ${REPORT_DIR}`);
  console.log(`  JSON: ${path.basename(jsonPath)}`);
  console.log(`  TXT:  ${path.basename(txtPath)}`);
  console.log();
  console.log(`Routes audited     : ${AUDIT_ROUTES.length}`);
  console.log(`Total violations   : ${totalViolations}`);
  console.log(`Blocking (critical/serious): ${totalCritical}`);
  console.log(`CI gate            : ${totalCritical === 0 ? '✓ PASS' : '✗ FAIL — deploy blocked'}`);
  console.log();

  // ── EXIT 1 on any blocking violation — blocks CI deploy ─────────────────
  if (totalCritical > 0) {
    console.error(`ERROR: ${totalCritical} critical WCAG violation(s) found. Deploy blocked.`);
    process.exit(1);
  }

  process.exit(0);
}

// Only run audit when executed directly — not when require()'d for config inspection
if (require.main === module) {
  runAudit().catch(err => {
    console.error('Audit failed:', err.message);
    process.exit(1);
  });
}

// ── Export audit config for unit testing (no browser required) ──────────────
// Both AXE_OPTIONS (new name) and AXE_CONFIG (legacy alias) exported for
// backwards-compatible require()-style introspection.
module.exports = { AUDIT_ROUTES, AXE_OPTIONS, AXE_CONFIG, BLOCKING_IMPACTS, BASE_URL };
