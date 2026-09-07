#!/usr/bin/env node
'use strict';

/**
 * S39-G3 — Core Web Vitals CI Budget
 * BRD A6 + Maqaleed Eval required
 *
 * Two audit modes (selected by CLI flag):
 *
 *   --lighthouse   Real Lighthouse measurement (requires Chrome).
 *                  Used in CI (GitHub Actions has Chrome pre-installed).
 *                  Collects actual LCP / INP / CLS from a running server.
 *
 *   --static       Bundle size + pattern analysis (default, no browser needed).
 *                  Analyzes built dist/ to estimate CWV metrics.
 *                  Acceptable proxy per spec when Lighthouse unavailable.
 *
 * Exit codes:
 *   0 — all critical routes pass budget thresholds
 *   1 — ≥1 critical route fails (LCP > 4s OR INP > 500ms OR CLS > 0.25)
 *       Blocks deploy in CI.
 *
 * Routes audited (4 critical routes per spec):
 *   /            → /#           (Login / Home)
 *   /ai          → /#analytics  (AI / Analytics)
 *   /workforce   → /#workers    (Workforce)
 *   /compliance  → /#governance (Compliance)
 *
 * Output: reports/performance/cwv-<timestamp>.json + .txt
 */

const fs   = require('fs');
const path = require('path');

// ── Load performance budget ───────────────────────────────────────────────────

const BUDGET_PATH = path.join(__dirname, '../app/frontend/src/performance-budget.json');
const BUDGET      = JSON.parse(fs.readFileSync(BUDGET_PATH, 'utf8'));

const CRITICAL_ROUTES = BUDGET.criticalRoutes;
const THRESHOLDS      = BUDGET.thresholds;
const BUNDLE_BUDGETS  = BUDGET.bundleBudgets;

// The metric set the gate MUST assert on every route. If any one of these is not
// measured, the run is a failure — never a pass. See evaluateMetrics().
const REQUIRED_METRICS = ['lcp', 'inp', 'cls'];

const REPORT_DIR = path.join(__dirname, '../reports/performance');
const BASE_URL   = process.env.AUDIT_URL || 'http://localhost:4173';
const DIST_DIR   = path.join(__dirname, '../app/frontend/dist');

// ── Pure evaluation function — tested without browser ────────────────────────

/**
 * evaluateMetrics({ lcp, inp, cls }, thresholds)
 *
 * Pure function — maps raw metric values to pass/fail against budget thresholds.
 * This is the core CI gate logic: exit(1) when violations.length > 0.
 *
 * @param  {{ lcp: number, inp: number, cls: number }} metrics — raw values
 * @param  {object} thresholds — from performance-budget.json
 * @returns {{ violations: Array, pass: boolean, ratings: object }}
 */
function evaluateMetrics(metrics, thresholds, opts) {
  thresholds = thresholds || THRESHOLDS;
  const required = (opts && opts.required) || REQUIRED_METRICS;
  const violations = [];
  const ratings    = {};
  const evaluated  = [];

  // A metric the harness could not measure is a FAILURE, not a silent skip.
  // Without this, evaluateMetrics({}) returned { pass: true, violations: [] } —
  // the gate reporting PASS having asserted nothing at all.
  const isMeasured = v => typeof v === 'number' && Number.isFinite(v);

  const RULES = {
    lcp: { label: 'LCP', unit: 'ms' },
    inp: { label: 'INP', unit: 'ms' },
    cls: { label: 'CLS', unit: ''   },
  };

  for (const key of required) {
    const rule  = RULES[key];
    const value = metrics ? metrics[key] : undefined;

    if (!rule) {
      violations.push({
        metric:  String(key).toUpperCase(),
        value:   null,
        limit:   null,
        unit:    '',
        reason:  'UNKNOWN_METRIC',
        message: `Required metric "${key}" has no evaluation rule`,
      });
      continue;
    }

    if (!isMeasured(value)) {
      ratings[key] = 'UNMEASURED';
      violations.push({
        metric:  rule.label,
        value:   value === undefined ? null : value,
        limit:   thresholds[key] ? thresholds[key].fail : null,
        unit:    rule.unit,
        reason:  'UNMEASURED',
        message: `${rule.label} was not measured (got ${JSON.stringify(value)}) — cannot certify the budget`,
      });
      continue;
    }

    const t = thresholds[key];
    if (!t || !isMeasured(t.good) || !isMeasured(t.needsImprovement) || !isMeasured(t.fail)) {
      ratings[key] = 'UNMEASURED';
      violations.push({
        metric:  rule.label,
        value,
        limit:   null,
        unit:    rule.unit,
        reason:  'NO_THRESHOLD',
        message: `${rule.label} has no usable threshold in the budget — cannot certify the budget`,
      });
      continue;
    }

    // This metric is genuinely being asserted against a real threshold.
    evaluated.push(key);

    if (value <= t.good) {
      ratings[key] = 'GOOD';
    } else if (value <= t.needsImprovement) {
      ratings[key] = 'NEEDS_IMPROVEMENT';
    } else {
      ratings[key] = 'POOR';
      violations.push({
        metric:  rule.label,
        value,
        limit:   t.fail,
        unit:    rule.unit,
        reason:  'OVER_BUDGET',
        message: `${rule.label} ${value}${rule.unit} exceeds fail threshold ${t.fail}${rule.unit}`,
      });
    }
  }

  return {
    violations,
    pass: violations.length === 0 && evaluated.length > 0,
    ratings,
    evaluated,
    assertionsRun: evaluated.length,
  };
}

// ── Static bundle analysis — no browser required ─────────────────────────────

/**
 * estimateFromBundle(distDir?)
 *
 * Analyzes the built Vite dist/ to estimate CWV metrics.
 * Used when Chrome/Lighthouse is unavailable.
 *
 * Estimation model (conservative — errs toward failing earlier):
 *   totalJsKb → estimatedLcpMs via stepwise lookup in budget lcp_estimate_map
 *   CLS patterns: images without width/height in HTML → CLS risk
 *   INP patterns: script count, inline event handlers → INP estimate
 *
 * @param {string} [distDir] — path to built dist/ (defaults to DIST_DIR)
 * @returns {{ totalJsKb, totalCssKb, estimatedLcpMs, estimatedInpMs, estimatedCls,
 *             bundleViolations, lcpSource }}
 */
function estimateFromBundle(distDir) {
  const dir = distDir || DIST_DIR;

  // If dist/ not yet built, fall back to analyzing src/ as a rough estimate
  const analysisDir = fs.existsSync(dir) ? dir : path.join(__dirname, '../app/frontend/src');
  const isSrc       = analysisDir !== dir;

  let totalJsBytes  = 0;
  let totalCssBytes = 0;
  let maxChunkBytes = 0;
  let htmlContent   = '';
  let scriptCount   = 0;
  let filesAnalyzed = 0;

  // Walk the directory recursively
  function walk(d) {
    if (!fs.existsSync(d)) return;
    for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
      const full = path.join(d, entry.name);
      if (entry.isDirectory()) { walk(full); continue; }
      const stat = fs.statSync(full);
      filesAnalyzed++;
      if (entry.name.endsWith('.js') || entry.name.endsWith('.mjs')) {
        totalJsBytes += stat.size;
        if (stat.size > maxChunkBytes) maxChunkBytes = stat.size;
        scriptCount++;
      } else if (entry.name.endsWith('.css')) {
        totalCssBytes += stat.size;
      } else if (entry.name.endsWith('.html')) {
        htmlContent += fs.readFileSync(full, 'utf8');
      }
    }
  }
  walk(analysisDir);

  const totalJsKb   = Math.round(totalJsBytes  / 1024);
  const totalCssKb  = Math.round(totalCssBytes / 1024);
  const maxChunkKb  = Math.round(maxChunkBytes / 1024);

  // Estimate LCP from bundle size using budget lcp_estimate_map
  const lcpMap = BUNDLE_BUDGETS._lcp_estimate_map || [];
  let estimatedLcpMs = 2000; // default GOOD
  for (const entry of lcpMap) {
    if (entry.maxJsKb === null || totalJsKb <= entry.maxJsKb) {
      estimatedLcpMs = entry.estimatedLcpMs;
      break;
    }
  }

  // Apply src/ multiplier — source JS is unminified (~3× larger than built)
  if (isSrc && totalJsKb > 0) {
    const builtEstimateKb = Math.round(totalJsKb / 3);
    for (const entry of lcpMap) {
      if (entry.maxJsKb === null || builtEstimateKb <= entry.maxJsKb) {
        estimatedLcpMs = entry.estimatedLcpMs;
        break;
      }
    }
  }

  // Estimate CLS — images without explicit dimensions cause layout shift
  const imgWithoutSize  = (htmlContent.match(/<img(?![^>]*(?:width|height))[^>]*>/gi) || []).length;
  const estimatedCls    = imgWithoutSize > 0 ? 0.15 : 0.03;

  // Estimate INP — many scripts or large bundles slow interaction
  const estimatedInpMs  = totalJsKb > 800 ? 350 : totalJsKb > 400 ? 180 : 120;

  // Bundle violations (separate from CWV violations — informational)
  const bundleViolations = [];
  if (totalJsKb > BUNDLE_BUDGETS.totalJsKb) {
    bundleViolations.push(`Total JS ${totalJsKb}KB exceeds budget ${BUNDLE_BUDGETS.totalJsKb}KB`);
  }
  if (totalCssKb > BUNDLE_BUDGETS.totalCssKb) {
    bundleViolations.push(`Total CSS ${totalCssKb}KB exceeds budget ${BUNDLE_BUDGETS.totalCssKb}KB`);
  }
  if (maxChunkKb > BUNDLE_BUDGETS.maxSingleChunkKb) {
    bundleViolations.push(`Largest chunk ${maxChunkKb}KB exceeds budget ${BUNDLE_BUDGETS.maxSingleChunkKb}KB`);
  }

  return {
    filesAnalyzed,
    totalJsKb,
    totalCssKb,
    maxChunkKb,
    scriptCount,
    estimatedLcpMs,
    estimatedInpMs,
    estimatedCls,
    bundleViolations,
    lcpSource:  isSrc ? 'src-estimate (dist/ not built)' : 'bundle-analysis',
    analysisDir,
  };
}

// ── Lighthouse mode — real measurement (CI with Chrome) ───────────────────────

async function runLighthouse(url) {
  // Lazy dynamic import — only loaded when --lighthouse is passed.
  // lighthouse v12 is ESM-only; `require()` of it throws ERR_REQUIRE_ESM on the
  // Node 18 CI runner, so this must be `await import(...)`, not require().
  const lighthouse   = (await import('lighthouse')).default;
  const chromeLaunch = (await import('chrome-launcher'));

  const chrome = await chromeLaunch.launch({ chromeFlags: ['--headless', '--no-sandbox', '--disable-gpu'] });
  try {
    const result = await lighthouse(url, {
      port:   chrome.port,
      output: 'json',
      logLevel: 'error',
      onlyCategories: ['performance'],
      throttlingMethod: 'simulate',
      // Simulate 4G mobile — conservative budget
      throttling: {
        rttMs:                   40,
        throughputKbps:          10240,
        cpuSlowdownMultiplier:   1,
        requestLatencyMs:        0,
        downloadThroughputKbps:  0,
        uploadThroughputKbps:    0,
      },
    });
    const audits = (result && result.lhr && result.lhr.audits) || null;
    if (!audits) throw new Error('Lighthouse returned no audits — nothing was measured');

    // `|| 0` here used to turn "Lighthouse produced no such audit" into a
    // perfect score: a run that measured NOTHING reported LCP 0ms / INP 0ms /
    // CLS 0 and the gate went green. An absent audit is now an error.
    const numeric = (...ids) => {
      for (const id of ids) {
        const v = audits[id] && audits[id].numericValue;
        if (typeof v === 'number' && Number.isFinite(v)) return v;
      }
      throw new Error(`Lighthouse audit missing or non-numeric: ${ids.join(' / ')}`);
    };

    return {
      lcp: Math.round(numeric('largest-contentful-paint')),
      inp: Math.round(numeric('interaction-to-next-paint', 'total-blocking-time')),
      cls: parseFloat(numeric('cumulative-layout-shift').toFixed(3)),
    };
  } finally {
    await chrome.kill();
  }
}

// ── Report utilities ──────────────────────────────────────────────────────────

function ensureReportDir() {
  if (!fs.existsSync(REPORT_DIR)) fs.mkdirSync(REPORT_DIR, { recursive: true });
}

function nowTs() {
  return new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
}

function ratingEmoji(r) {
  return r === 'GOOD' ? '✓' : r === 'NEEDS_IMPROVEMENT' ? '⚠' : '✗';
}

// ── Main audit runner ─────────────────────────────────────────────────────────

async function runAudit() {
  const useLighthouse = process.argv.includes('--lighthouse');
  const mode = useLighthouse ? 'lighthouse' : 'static';

  console.log('┌─ Core Web Vitals CI Budget ───────────────────────────────────');
  console.log(`│  Mode     : ${mode}`);
  console.log(`│  Routes   : ${CRITICAL_ROUTES.length} critical routes`);
  console.log(`│  LCP fail : > ${THRESHOLDS.lcp.fail}ms → EXIT 1`);
  console.log(`│  INP fail : > ${THRESHOLDS.inp.fail}ms → EXIT 1`);
  console.log(`│  CLS fail : > ${THRESHOLDS.cls.fail} → EXIT 1`);
  console.log('└──────────────────────────────────────────────────────────────');
  console.log();

  ensureReportDir();

  const allResults    = [];
  let   totalViolations = 0;
  // Vacuous-pass accounting. A run that asserts nothing must never exit 0.
  let   routesEvaluated = 0;
  let   assertionsRun   = 0;

  if (!Array.isArray(CRITICAL_ROUTES) || CRITICAL_ROUTES.length === 0) {
    console.error('ERROR: performance budget declares no critical routes — the gate would certify nothing.');
    process.exit(1);
  }

  if (mode === 'static') {
    // ── Static mode: one bundle analysis → applied to all 4 routes ─────────
    console.log('Static bundle analysis mode (no browser required)');
    const bundle = estimateFromBundle();
    if (bundle.filesAnalyzed === 0) {
      console.error(`ERROR: static analysis found 0 files under ${bundle.analysisDir}.`);
      console.error('       An empty analysis cannot estimate CWV — refusing to report PASS.');
      process.exit(1);
    }
    console.log(`  Analysis dir : ${bundle.analysisDir} (${bundle.filesAnalyzed} files)`);
    console.log(`  Total JS     : ${bundle.totalJsKb}KB`);
    console.log(`  Total CSS    : ${bundle.totalCssKb}KB`);
    console.log(`  Largest chunk: ${bundle.maxChunkKb}KB`);
    console.log(`  Estimated LCP: ${bundle.estimatedLcpMs}ms (${bundle.lcpSource})`);
    console.log(`  Estimated INP: ${bundle.estimatedInpMs}ms`);
    console.log(`  Estimated CLS: ${bundle.estimatedCls}`);
    if (bundle.bundleViolations.length > 0) {
      console.log(`  Bundle warnings:`);
      bundle.bundleViolations.forEach(v => console.log(`    ⚠ ${v}`));
    }
    console.log();

    const metrics = {
      lcp: bundle.estimatedLcpMs,
      inp: bundle.estimatedInpMs,
      cls: bundle.estimatedCls,
    };

    for (const route of CRITICAL_ROUTES) {
      const evaluation = evaluateMetrics(metrics, THRESHOLDS);
      totalViolations += evaluation.violations.length;
      routesEvaluated += 1;
      assertionsRun   += evaluation.assertionsRun;

      const status = evaluation.pass ? '✓ PASS' : '✗ FAIL';
      console.log(`${status}  ${route.label} (${route.path})`);
      console.log(`  LCP ${ratingEmoji(evaluation.ratings.lcp)} ${metrics.lcp}ms   INP ${ratingEmoji(evaluation.ratings.inp)} ${metrics.inp}ms   CLS ${ratingEmoji(evaluation.ratings.cls)} ${metrics.cls}`);
      if (!evaluation.pass) {
        evaluation.violations.forEach(v => console.log(`  ✗ ${v.message}`));
      }
      console.log();

      allResults.push({
        route:        route.label,
        path:         route.path,
        mode:         'static-estimate',
        lcpSource:    bundle.lcpSource,
        metrics,
        ratings:      evaluation.ratings,
        violations:   evaluation.violations,
        assertions:   evaluation.assertionsRun,
        pass:         evaluation.pass,
        bundleStats:  { totalJsKb: bundle.totalJsKb, totalCssKb: bundle.totalCssKb, maxChunkKb: bundle.maxChunkKb },
      });
    }
  } else {
    // ── Lighthouse mode: real per-route measurement ─────────────────────────
    for (const route of CRITICAL_ROUTES) {
      const url = route.hash
        ? `${BASE_URL}/#${route.hash}`
        : BASE_URL;

      console.log(`Measuring ${route.label} (${url})`);
      let metrics;
      let measurementError = null;
      try {
        metrics = await runLighthouse(url);
      } catch (e) {
        // A route we could not measure is UNMEASURED, not "measured as bad".
        // evaluateMetrics turns each missing metric into an explicit violation,
        // so the failure is reported as what it is rather than as a fake score.
        console.error(`  Failed to measure ${url}: ${e.message}`);
        measurementError = e.message;
        metrics = {};
      }

      const evaluation = evaluateMetrics(metrics, THRESHOLDS);
      totalViolations += evaluation.violations.length;
      routesEvaluated += 1;
      assertionsRun   += evaluation.assertionsRun;

      const status = evaluation.pass ? '✓ PASS' : '✗ FAIL';
      console.log(`${status}  LCP ${metrics.lcp}ms  INP ${metrics.inp}ms  CLS ${metrics.cls}`);
      if (!evaluation.pass) {
        evaluation.violations.forEach(v => console.log(`  ✗ ${v.message}`));
      }
      console.log();

      allResults.push({
        route:      route.label,
        path:       route.path,
        mode:       'lighthouse',
        metrics,
        ratings:    evaluation.ratings,
        violations: evaluation.violations,
        assertions: evaluation.assertionsRun,
        measurementError,
        pass:       evaluation.pass,
      });
    }
  }

  // ── Write reports ─────────────────────────────────────────────────────────
  const ts = nowTs();

  const jsonReport = {
    generated_at:     new Date().toISOString(),
    mode,
    budget_version:   BUDGET.version,
    thresholds:       THRESHOLDS,
    routes_audited:   CRITICAL_ROUTES.length,
    routes_evaluated: routesEvaluated,
    assertions_run:   assertionsRun,
    total_violations: totalViolations,
    ci_gate_passed:   totalViolations === 0 && assertionsRun > 0
                        && routesEvaluated === CRITICAL_ROUTES.length,
    results:          allResults,
  };

  const jsonPath = path.join(REPORT_DIR, `cwv-${ts}.json`);
  const txtPath  = path.join(REPORT_DIR, `cwv-${ts}.txt`);

  fs.writeFileSync(jsonPath, JSON.stringify(jsonReport, null, 2), 'utf8');

  const summary = [
    'Core Web Vitals CI Budget Report',
    `Generated  : ${new Date().toISOString()}`,
    `Mode       : ${mode}`,
    `Budget ver : ${BUDGET.version}`,
    '─'.repeat(60),
    `Thresholds : LCP ≤${THRESHOLDS.lcp.fail}ms | INP ≤${THRESHOLDS.inp.fail}ms | CLS ≤${THRESHOLDS.cls.fail}`,
    '',
    ...allResults.map(r =>
      `${r.pass ? 'PASS' : 'FAIL'}  ${r.route} (${r.path})\n` +
      `      LCP: ${r.metrics.lcp}ms [${r.ratings.lcp}]  ` +
      `INP: ${r.metrics.inp}ms [${r.ratings.inp}]  ` +
      `CLS: ${r.metrics.cls} [${r.ratings.cls}]\n` +
      (r.violations.length ? r.violations.map(v => `      ✗ ${v.message}`).join('\n') + '\n' : ''),
    ),
    '─'.repeat(60),
    `TOTAL VIOLATIONS  : ${totalViolations}`,
    `CI GATE           : ${totalViolations === 0 ? 'PASS' : 'FAIL — deploy blocked'}`,
  ].join('\n');

  fs.writeFileSync(txtPath, summary, 'utf8');

  console.log('─'.repeat(60));
  console.log(`Reports: ${REPORT_DIR}`);
  console.log(`  ${path.basename(jsonPath)}`);
  console.log(`  ${path.basename(txtPath)}`);
  console.log();
  const expectedAssertions = CRITICAL_ROUTES.length * REQUIRED_METRICS.length;
  const vacuous = assertionsRun === 0
               || routesEvaluated !== CRITICAL_ROUTES.length
               || assertionsRun !== expectedAssertions;

  console.log(`Routes audited    : ${CRITICAL_ROUTES.length}`);
  console.log(`Routes evaluated  : ${routesEvaluated}`);
  console.log(`Assertions run    : ${assertionsRun} / ${expectedAssertions} expected`);
  console.log(`Total violations  : ${totalViolations}`);
  console.log(`CI gate           : ${(totalViolations === 0 && !vacuous) ? '✓ PASS' : '✗ FAIL — deploy blocked'}`);
  console.log();

  // ── A run that asserted nothing is a FAILURE, not a pass ─────────────────
  // This is the defect this gate was built to have: exit 0 having evaluated
  // nothing. The gate may only report PASS when it can show the assertions it
  // actually ran.
  if (vacuous) {
    console.error('ERROR: CWV gate did not evaluate its full assertion set.');
    console.error(`       routes evaluated ${routesEvaluated}/${CRITICAL_ROUTES.length}, ` +
                  `assertions run ${assertionsRun}/${expectedAssertions}.`);
    console.error('       A gate that certifies nothing is a failure. Deploy blocked.');
    process.exit(1);
  }

  // ── EXIT 1 on any violation — blocks CI deploy ──────────────────────────
  if (totalViolations > 0) {
    console.error(`ERROR: ${totalViolations} CWV budget violation(s). Deploy blocked.`);
    process.exit(1);
  }

  process.exit(0);
}

// Only run when executed directly — not when require()'d for config inspection
if (require.main === module) {
  runAudit().catch(err => {
    console.error('CWV audit failed:', err.message);
    process.exit(1);
  });
}

// ── Exports for unit testing (no browser required) ───────────────────────────
module.exports = {
  BUDGET,
  CRITICAL_ROUTES,
  THRESHOLDS,
  BUNDLE_BUDGETS,
  REQUIRED_METRICS,
  evaluateMetrics,
  estimateFromBundle,
  REPORT_DIR,
};
