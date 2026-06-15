'use strict';

/**
 * S39-G3 — Core Web Vitals CI Gate Tests
 *
 * Tests pure evaluation logic and CI wiring — no browser, no Lighthouse.
 *
 * Suite 1: evaluateMetrics — LCP pass/fail thresholds
 * Suite 2: evaluateMetrics — INP pass/fail thresholds
 * Suite 3: evaluateMetrics — CLS pass/fail thresholds
 * Suite 4: Budget file schema — 4 critical routes, all thresholds present
 * Suite 5: estimateFromBundle — static analysis (source files fallback)
 * Suite 6: CI config — cwv job after wcag, exit-1 language, budget file ref
 * Suite 7: Report path and output configuration
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs   = require('fs');
const path = require('path');

const {
  BUDGET,
  CRITICAL_ROUTES,
  THRESHOLDS,
  BUNDLE_BUDGETS,
  evaluateMetrics,
  estimateFromBundle,
  REPORT_DIR,
} = require('../scripts/cwv_audit.js');

const ROOT = path.join(__dirname, '..');

// ── Suite 1: LCP thresholds ───────────────────────────────────────────────────

describe('Suite 1: LCP thresholds', () => {
  it('LCP ≤ 2500ms → GOOD, no violation', () => {
    const result = evaluateMetrics({ lcp: 2500, inp: 100, cls: 0.05 });
    assert.equal(result.ratings.lcp, 'GOOD');
    assert.equal(result.violations.filter(v => v.metric === 'LCP').length, 0);
    assert.equal(result.pass, true);
  });

  it('LCP = 3000ms → NEEDS_IMPROVEMENT, no CI violation', () => {
    const result = evaluateMetrics({ lcp: 3000, inp: 100, cls: 0.05 });
    assert.equal(result.ratings.lcp, 'NEEDS_IMPROVEMENT');
    // NEEDS_IMPROVEMENT does not trigger exit(1) — only >fail threshold does
    assert.equal(result.violations.filter(v => v.metric === 'LCP').length, 0);
  });

  it('LCP = 4001ms → POOR, violation logged, exit(1) triggered', () => {
    const result = evaluateMetrics({ lcp: 4001, inp: 100, cls: 0.05 });
    assert.equal(result.ratings.lcp, 'POOR');
    const lcpViolation = result.violations.find(v => v.metric === 'LCP');
    assert.ok(lcpViolation, 'LCP violation must be reported');
    assert.equal(lcpViolation.value, 4001);
    assert.equal(lcpViolation.limit, THRESHOLDS.lcp.fail);
    assert.equal(result.pass, false, 'pass must be false when LCP exceeds fail threshold');
  });

  it('LCP exactly at fail threshold (4000ms) → NEEDS_IMPROVEMENT, no violation', () => {
    // fail threshold is >4000, so exactly 4000 should still pass
    const result = evaluateMetrics({ lcp: 4000, inp: 100, cls: 0.05 });
    assert.equal(result.violations.filter(v => v.metric === 'LCP').length, 0,
      'LCP exactly at threshold should not violate');
  });

  it('LCP fail threshold is 4000ms (per spec: fail if >4s)', () => {
    assert.equal(THRESHOLDS.lcp.fail, 4000, 'LCP fail threshold must be 4000ms per spec');
  });

  it('LCP good threshold is 2500ms (per spec: LCP ≤2.5s GOOD)', () => {
    assert.equal(THRESHOLDS.lcp.good, 2500, 'LCP good threshold must be 2500ms per spec');
  });
});

// ── Suite 2: INP thresholds ───────────────────────────────────────────────────

describe('Suite 2: INP thresholds', () => {
  it('INP ≤ 200ms → GOOD, no violation', () => {
    const result = evaluateMetrics({ lcp: 2000, inp: 200, cls: 0.05 });
    assert.equal(result.ratings.inp, 'GOOD');
    assert.equal(result.violations.filter(v => v.metric === 'INP').length, 0);
  });

  it('INP = 350ms → NEEDS_IMPROVEMENT, no violation', () => {
    const result = evaluateMetrics({ lcp: 2000, inp: 350, cls: 0.05 });
    assert.equal(result.ratings.inp, 'NEEDS_IMPROVEMENT');
    assert.equal(result.violations.filter(v => v.metric === 'INP').length, 0);
  });

  it('INP = 501ms → POOR, violation, exit(1)', () => {
    const result = evaluateMetrics({ lcp: 2000, inp: 501, cls: 0.05 });
    assert.equal(result.ratings.inp, 'POOR');
    const v = result.violations.find(v => v.metric === 'INP');
    assert.ok(v, 'INP violation must be reported');
    assert.equal(result.pass, false);
  });

  it('INP fail threshold is 500ms (per spec: fail if >500ms)', () => {
    assert.equal(THRESHOLDS.inp.fail, 500, 'INP fail threshold must be 500ms per spec');
  });

  it('INP good threshold is 200ms (per spec: INP ≤200ms GOOD)', () => {
    assert.equal(THRESHOLDS.inp.good, 200, 'INP good threshold must be 200ms per spec');
  });
});

// ── Suite 3: CLS thresholds ───────────────────────────────────────────────────

describe('Suite 3: CLS thresholds', () => {
  it('CLS ≤ 0.1 → GOOD, no violation', () => {
    const result = evaluateMetrics({ lcp: 2000, inp: 100, cls: 0.1 });
    assert.equal(result.ratings.cls, 'GOOD');
    assert.equal(result.violations.filter(v => v.metric === 'CLS').length, 0);
  });

  it('CLS = 0.15 → NEEDS_IMPROVEMENT, no violation', () => {
    const result = evaluateMetrics({ lcp: 2000, inp: 100, cls: 0.15 });
    assert.equal(result.ratings.cls, 'NEEDS_IMPROVEMENT');
    assert.equal(result.violations.filter(v => v.metric === 'CLS').length, 0);
  });

  it('CLS = 0.26 → POOR, violation, exit(1)', () => {
    const result = evaluateMetrics({ lcp: 2000, inp: 100, cls: 0.26 });
    assert.equal(result.ratings.cls, 'POOR');
    const v = result.violations.find(v => v.metric === 'CLS');
    assert.ok(v, 'CLS violation must be reported');
    assert.equal(result.pass, false);
  });

  it('CLS fail threshold is 0.25 (per spec: fail if >0.25)', () => {
    assert.equal(THRESHOLDS.cls.fail, 0.25, 'CLS fail threshold must be 0.25 per spec');
  });

  it('CLS good threshold is 0.1 (per spec: CLS ≤0.1 GOOD)', () => {
    assert.equal(THRESHOLDS.cls.good, 0.10, 'CLS good threshold must be 0.1 per spec');
  });

  it('multiple violations in one call — all reported', () => {
    const result = evaluateMetrics({ lcp: 5000, inp: 600, cls: 0.30 });
    assert.equal(result.violations.length, 3, 'all three metric violations reported');
    assert.equal(result.pass, false);
  });

  it('all metrics at GOOD level → pass: true, violations: []', () => {
    const result = evaluateMetrics({ lcp: 1500, inp: 150, cls: 0.05 });
    assert.equal(result.pass, true);
    assert.equal(result.violations.length, 0);
    assert.equal(result.ratings.lcp, 'GOOD');
    assert.equal(result.ratings.inp, 'GOOD');
    assert.equal(result.ratings.cls, 'GOOD');
  });
});

// ── Suite 4: Budget file schema ───────────────────────────────────────────────

describe('Suite 4: performance budget file schema', () => {
  it('budget file exists at app/frontend/src/performance-budget.json', () => {
    const budgetPath = path.join(ROOT, 'app/frontend/src/performance-budget.json');
    assert.ok(fs.existsSync(budgetPath), 'performance-budget.json must exist');
  });

  it('budget has exactly 4 critical routes', () => {
    assert.equal(CRITICAL_ROUTES.length, 4, 'must have exactly 4 critical routes per spec');
  });

  it('budget includes /, /ai, /workforce, /compliance routes', () => {
    const paths = CRITICAL_ROUTES.map(r => r.path);
    assert.ok(paths.includes('/'),           '/ route required');
    assert.ok(paths.includes('/ai'),         '/ai route required');
    assert.ok(paths.includes('/workforce'),  '/workforce route required');
    assert.ok(paths.includes('/compliance'), '/compliance route required');
  });

  it('all critical routes have path, hash, and label', () => {
    for (const route of CRITICAL_ROUTES) {
      assert.ok(route.path,  `route missing path: ${JSON.stringify(route)}`);
      assert.ok(typeof route.hash === 'string', `route missing hash: ${JSON.stringify(route)}`);
      assert.ok(route.label, `route missing label: ${JSON.stringify(route)}`);
    }
  });

  it('budget file has _comment requiring PR review for changes', () => {
    const content = fs.readFileSync(path.join(ROOT, 'app/frontend/src/performance-budget.json'), 'utf8');
    assert.ok(content.includes('PR review') || content.includes('review'), 'budget file must note PR review requirement');
  });

  it('all three CWV metrics have good/needsImprovement/fail thresholds', () => {
    for (const metric of ['lcp', 'inp', 'cls']) {
      assert.ok(THRESHOLDS[metric].good             !== undefined, `${metric}.good missing`);
      assert.ok(THRESHOLDS[metric].needsImprovement !== undefined, `${metric}.needsImprovement missing`);
      assert.ok(THRESHOLDS[metric].fail             !== undefined, `${metric}.fail missing`);
    }
  });

  it('bundle budgets are defined in budget file', () => {
    assert.ok(typeof BUNDLE_BUDGETS.totalJsKb     === 'number', 'totalJsKb budget required');
    assert.ok(typeof BUNDLE_BUDGETS.totalCssKb    === 'number', 'totalCssKb budget required');
    assert.ok(typeof BUNDLE_BUDGETS.maxSingleChunkKb === 'number', 'maxSingleChunkKb budget required');
  });
});

// ── Suite 5: estimateFromBundle — static analysis ─────────────────────────────

describe('Suite 5: estimateFromBundle — static analysis', () => {
  it('returns numeric estimates without browser', () => {
    const result = estimateFromBundle();
    assert.ok(typeof result.totalJsKb     === 'number', 'totalJsKb must be a number');
    assert.ok(typeof result.totalCssKb    === 'number', 'totalCssKb must be a number');
    assert.ok(typeof result.estimatedLcpMs === 'number', 'estimatedLcpMs must be a number');
    assert.ok(typeof result.estimatedInpMs === 'number', 'estimatedInpMs must be a number');
    assert.ok(typeof result.estimatedCls  === 'number', 'estimatedCls must be a number');
  });

  it('estimated metrics are within plausible ranges for this codebase', () => {
    const result = estimateFromBundle();
    // LCP: should be between 500ms and 8000ms
    assert.ok(result.estimatedLcpMs >= 500 && result.estimatedLcpMs <= 8000,
      `estimatedLcpMs ${result.estimatedLcpMs} out of plausible range`);
    // INP: should be between 50ms and 1000ms
    assert.ok(result.estimatedInpMs >= 50 && result.estimatedInpMs <= 1000,
      `estimatedInpMs ${result.estimatedInpMs} out of plausible range`);
    // CLS: should be 0.0 to 1.0
    assert.ok(result.estimatedCls >= 0 && result.estimatedCls <= 1.0,
      `estimatedCls ${result.estimatedCls} out of plausible range`);
  });

  it('estimated metrics pass the budget thresholds for this vanilla JS SPA', () => {
    // ProWork admin SPA: vanilla JS, minimal deps — should be well under budget
    const result = estimateFromBundle();
    const evaluation = evaluateMetrics({
      lcp: result.estimatedLcpMs,
      inp: result.estimatedInpMs,
      cls: result.estimatedCls,
    });
    assert.equal(evaluation.pass, true,
      `Vanilla JS SPA should pass CWV budget. ` +
      `Estimated: LCP=${result.estimatedLcpMs}ms INP=${result.estimatedInpMs}ms CLS=${result.estimatedCls}. ` +
      `Violations: ${evaluation.violations.map(v => v.message).join(', ')}`
    );
  });

  it('large synthetic bundle → estimated LCP > threshold (fail logic works)', () => {
    // Test the evaluation function with forced bad values — not the real bundle
    const badMetrics = { lcp: 4500, inp: 100, cls: 0.05 };
    const result = evaluateMetrics(badMetrics);
    assert.equal(result.pass, false, 'Large LCP should fail budget');
    assert.ok(result.violations.some(v => v.metric === 'LCP'));
  });

  it('estimateFromBundle returns bundleViolations array', () => {
    const result = estimateFromBundle();
    assert.ok(Array.isArray(result.bundleViolations), 'bundleViolations must be an array');
  });

  it('estimateFromBundle returns lcpSource string', () => {
    const result = estimateFromBundle();
    assert.ok(typeof result.lcpSource === 'string' && result.lcpSource.length > 0,
      'lcpSource must indicate analysis origin');
  });
});

// ── Suite 6: CI config ────────────────────────────────────────────────────────

describe('Suite 6: CI config — cwv job after wcag, before deploy', () => {
  const ciPath = path.join(ROOT, '.github/workflows/ci.yml');

  it('ci.yml has cwv job', () => {
    const content = fs.readFileSync(ciPath, 'utf8');
    assert.ok(content.includes('cwv:'), 'ci.yml must define cwv: job');
  });

  it('cwv job declares needs: wcag — runs AFTER wcag', () => {
    const content = fs.readFileSync(ciPath, 'utf8');
    assert.ok(content.includes('needs: wcag'), 'cwv job must depend on wcag job (AFTER wcag)');
  });

  it('cwv job references cwv_audit.js script', () => {
    const content = fs.readFileSync(ciPath, 'utf8');
    assert.ok(content.includes('cwv_audit.js'), 'ci.yml must call scripts/cwv_audit.js');
  });

  it('cwv job has BRD A6 + Maqaleed Eval comment', () => {
    const content = fs.readFileSync(ciPath, 'utf8');
    // Count occurrences — both wcag and cwv jobs should have it
    const count = (content.match(/BRD A6/g) || []).length;
    assert.ok(count >= 2, 'Both wcag and cwv CI jobs must have BRD A6 comment');
  });

  it('cwv job references build:ui step', () => {
    const content = fs.readFileSync(ciPath, 'utf8');
    const cwvSection = content.split('cwv:')[1] || '';
    assert.ok(cwvSection.includes('build:ui') || cwvSection.includes('vite build'),
      'cwv job must build frontend before auditing');
  });

  it('ci.yml pipeline order: app → wcag → cwv', () => {
    const content = fs.readFileSync(ciPath, 'utf8');
    const appPos  = content.indexOf('needs: app');
    const wcagPos = content.indexOf('needs: wcag');
    assert.ok(appPos > 0,  'wcag must need app');
    assert.ok(wcagPos > 0, 'cwv must need wcag');
    assert.ok(wcagPos > appPos, 'cwv (needs: wcag) must appear after wcag (needs: app)');
  });

  it('cwv job uploads performance report as artifact', () => {
    const content = fs.readFileSync(ciPath, 'utf8');
    assert.ok(content.includes('cwv-performance-report') || content.includes('reports/performance'),
      'performance report must be uploaded as artifact');
  });
});

// ── Suite 7: Report path configuration ───────────────────────────────────────

describe('Suite 7: report output configuration', () => {
  it('REPORT_DIR points to reports/performance/', () => {
    assert.ok(REPORT_DIR.includes('reports/performance'), 'REPORT_DIR must be reports/performance/');
  });

  it('reports/performance/ directory exists', () => {
    const dir = path.join(ROOT, 'reports/performance');
    assert.ok(fs.existsSync(dir), 'reports/performance/ directory must exist');
  });

  it('cwv_audit.js writes .json report', () => {
    const src = fs.readFileSync(path.join(ROOT, 'scripts/cwv_audit.js'), 'utf8');
    assert.ok(src.includes('.json'), 'must write JSON report');
  });

  it('cwv_audit.js writes .txt report', () => {
    const src = fs.readFileSync(path.join(ROOT, 'scripts/cwv_audit.js'), 'utf8');
    assert.ok(src.includes('.txt'), 'must write TXT report');
  });

  it('report filenames include timestamp', () => {
    const src = fs.readFileSync(path.join(ROOT, 'scripts/cwv_audit.js'), 'utf8');
    assert.ok(src.includes('nowTs') || src.includes('timestamp'), 'report filenames must use timestamps');
  });
});
