'use strict';

/**
 * S39-G2 — WCAG CI Gate Tests
 *
 * Tests the audit configuration and CI wiring without requiring a browser.
 * Verifies:
 *   Suite 1: Route coverage — all 9 spec routes present
 *   Suite 2: WCAG 2.2 criteria — 2.4.11 + 2.5.8 explicitly included
 *   Suite 3: Blocking impact levels — critical + serious trigger exit(1)
 *   Suite 4: CI config integrity — wcag job present, needs: app, exit-1 language
 *   Suite 5: Accessibility fixes — HTML landmarks, skip link, focus CSS in source
 *   Suite 6: Report path — output configured to reports/accessibility/
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs   = require('fs');
const path = require('path');

// ── Load audit config (no browser spawn) ─────────────────────────────────────

const { AUDIT_ROUTES, AXE_CONFIG, BLOCKING_IMPACTS, BASE_URL } =
  require('../scripts/wcag_audit.js');

const ROOT = path.join(__dirname, '..');

// ── Suite 1: Route coverage ───────────────────────────────────────────────────

describe('Suite 1: route coverage — 9 spec routes', () => {
  it('audit config has exactly 9 routes', () => {
    assert.equal(AUDIT_ROUTES.length, 9, 'must crawl all 9 spec routes');
  });

  it('login route (/) is included — requiresAuth: false', () => {
    const loginRoute = AUDIT_ROUTES.find(r => !r.requiresAuth);
    assert.ok(loginRoute, 'login/home route present');
    assert.equal(loginRoute.requiresAuth, false);
  });

  it('all spec route labels are present', () => {
    const labels = AUDIT_ROUTES.map(r => r.label);
    const combined = labels.join(' ');
    // Check each spec path appears in at least one label
    for (const specPath of ['/', '/ai', '/workforce', '/compliance', '/evidence', '/payments', '/admin', '/programs', '/identity']) {
      assert.ok(
        combined.includes(specPath.replace('/', '')),
        `spec path "${specPath}" not mapped in AUDIT_ROUTES`,
      );
    }
  });

  it('auth-required routes use CI token injection', () => {
    const authRoutes = AUDIT_ROUTES.filter(r => r.requiresAuth);
    assert.ok(authRoutes.length >= 8, 'at least 8 routes require auth token injection');
  });

  it('all routes have a label and hash', () => {
    for (const route of AUDIT_ROUTES) {
      assert.ok(typeof route.label === 'string' && route.label.length > 0, `route missing label: ${JSON.stringify(route)}`);
      assert.ok(typeof route.hash === 'string', `route missing hash: ${JSON.stringify(route)}`);
    }
  });
});

// ── Suite 2: WCAG 2.2 criteria ────────────────────────────────────────────────

describe('Suite 2: WCAG 2.2 criteria explicitly included', () => {
  it('wcag22aa tag is in runOnly values', () => {
    const tags = AXE_CONFIG.runOnly.values;
    assert.ok(tags.includes('wcag22aa'), 'wcag22aa tag required for WCAG 2.2 coverage');
  });

  it('wcag2aa tag is included for baseline AA coverage', () => {
    const tags = AXE_CONFIG.runOnly.values;
    assert.ok(tags.includes('wcag2aa'), 'wcag2aa tag required');
  });

  it('wcag21aa tag is included for WCAG 2.1 AA coverage', () => {
    const tags = AXE_CONFIG.runOnly.values;
    assert.ok(tags.includes('wcag21aa'), 'wcag21aa tag required');
  });

  it('2.4.11 Focus Appearance: focus-visible rule explicitly enabled', () => {
    assert.equal(
      AXE_CONFIG.rules['focus-visible']?.enabled, true,
      'focus-visible rule must be explicitly enabled (WCAG 2.4.11)',
    );
  });

  it('2.5.8 Target Size: target-size rule explicitly enabled', () => {
    assert.equal(
      AXE_CONFIG.rules['target-size']?.enabled, true,
      'target-size rule must be explicitly enabled (WCAG 2.5.8)',
    );
  });

  it('color-contrast rule is enabled', () => {
    assert.equal(AXE_CONFIG.rules['color-contrast']?.enabled, true);
  });

  it('label rule is enabled (catches missing form labels)', () => {
    assert.equal(AXE_CONFIG.rules['label']?.enabled, true);
  });

  it('skip-link / bypass rule is enabled (WCAG 2.4.1)', () => {
    const bypassEnabled = AXE_CONFIG.rules['bypass']?.enabled || AXE_CONFIG.rules['skip-link']?.enabled;
    assert.ok(bypassEnabled, 'bypass or skip-link rule must be enabled');
  });
});

// ── Suite 3: Blocking impact levels ──────────────────────────────────────────

describe('Suite 3: blocking impact levels → exit(1)', () => {
  it('BLOCKING_IMPACTS contains "critical"', () => {
    assert.ok(BLOCKING_IMPACTS.has('critical'), '"critical" must trigger exit(1)');
  });

  it('BLOCKING_IMPACTS contains "serious"', () => {
    assert.ok(BLOCKING_IMPACTS.has('serious'), '"serious" must trigger exit(1)');
  });

  it('BLOCKING_IMPACTS does NOT contain "moderate" (non-blocking)', () => {
    assert.equal(BLOCKING_IMPACTS.has('moderate'), false, '"moderate" should not block CI');
  });

  it('BLOCKING_IMPACTS does NOT contain "minor" (non-blocking)', () => {
    assert.equal(BLOCKING_IMPACTS.has('minor'), false, '"minor" should not block CI');
  });
});

// ── Suite 4: CI config integrity ─────────────────────────────────────────────

describe('Suite 4: CI config integrity', () => {
  const ciPath = path.join(ROOT, '.github/workflows/ci.yml');
  let ciContent = '';

  before_once: {
    try { ciContent = fs.readFileSync(ciPath, 'utf8'); } catch { ciContent = ''; }
  }

  it('ci.yml exists', () => {
    assert.ok(fs.existsSync(ciPath), '.github/workflows/ci.yml must exist');
  });

  it('ci.yml has wcag job defined', () => {
    // Re-read fresh each time
    const content = fs.readFileSync(ciPath, 'utf8');
    assert.ok(content.includes('wcag:'), 'ci.yml must define a "wcag:" job');
  });

  it('wcag job declares needs: app — runs after backend tests', () => {
    const content = fs.readFileSync(ciPath, 'utf8');
    assert.ok(content.includes('needs: app'), 'wcag job must depend on app job');
  });

  it('ci.yml references the wcag_audit.js script', () => {
    const content = fs.readFileSync(ciPath, 'utf8');
    assert.ok(content.includes('wcag_audit.js'), 'ci.yml must call scripts/wcag_audit.js');
  });

  it('ci.yml has BRD A6 + Maqaleed Eval comment', () => {
    const content = fs.readFileSync(ciPath, 'utf8');
    assert.ok(content.includes('BRD A6') && content.includes('Maqaleed Eval'), 'BRD comment required in CI config');
  });

  it('ci.yml references vite build step (build:ui)', () => {
    const content = fs.readFileSync(ciPath, 'utf8');
    assert.ok(content.includes('build:ui') || content.includes('vite build'), 'frontend must be built before wcag audit');
  });

  it('ci.yml has exit-1 language or equivalent in wcag step', () => {
    const content = fs.readFileSync(ciPath, 'utf8');
    // "Exit 1" is in the job name/comment and in the script itself via process.exit(1)
    assert.ok(
      content.includes('EXIT 1') || content.includes('exit 1') || content.includes('exit(1)'),
      'ci.yml must communicate exit-1 blocking behaviour',
    );
  });

  it('upload-artifact step present — reports preserved on failure', () => {
    const content = fs.readFileSync(ciPath, 'utf8');
    assert.ok(content.includes('upload-artifact'), 'audit reports must be uploaded for review');
  });
});

// ── Suite 5: Accessibility fixes in source ────────────────────────────────────

describe('Suite 5: accessibility fixes in frontend source', () => {
  it('index.html has skip-link element', () => {
    const html = fs.readFileSync(path.join(ROOT, 'app/frontend/index.html'), 'utf8');
    assert.ok(html.includes('skip-link') || html.includes('Skip to main content'), 'skip link required in index.html (WCAG 2.4.1)');
  });

  it('style.css defines :focus-visible styles (WCAG 2.4.11)', () => {
    const css = fs.readFileSync(path.join(ROOT, 'app/frontend/src/style.css'), 'utf8');
    assert.ok(css.includes(':focus-visible'), ':focus-visible rule required (WCAG 2.4.11 Focus Appearance)');
  });

  it('style.css defines .skip-link styles', () => {
    const css = fs.readFileSync(path.join(ROOT, 'app/frontend/src/style.css'), 'utf8');
    assert.ok(css.includes('.skip-link'), '.skip-link styles required (WCAG 2.4.1)');
  });

  it('style.css defines .sr-only utility class', () => {
    const css = fs.readFileSync(path.join(ROOT, 'app/frontend/src/style.css'), 'utf8');
    assert.ok(css.includes('.sr-only'), '.sr-only class required for screen-reader accessible labels');
  });

  it('style.css enforces min-height on .btn (WCAG 2.5.8 target size)', () => {
    const css = fs.readFileSync(path.join(ROOT, 'app/frontend/src/style.css'), 'utf8');
    assert.ok(css.includes('min-height'), 'min-height required on interactive targets (WCAG 2.5.8)');
  });

  it('main.js associates label with token input (WCAG 1.3.1 / 4.1.2)', () => {
    const js = fs.readFileSync(path.join(ROOT, 'app/frontend/src/main.js'), 'utf8');
    assert.ok(js.includes('token-input') && (js.includes('htmlFor') || js.includes('aria-label')),
      'login token input must have associated label (WCAG 1.3.1 / 4.1.2)');
  });

  it('nav.js adds aria-label to navigation landmark (WCAG 4.1.2)', () => {
    const js = fs.readFileSync(path.join(ROOT, 'app/frontend/src/components/nav.js'), 'utf8');
    assert.ok(js.includes('aria-label') && js.includes('navigation'),
      'nav must have aria-label (WCAG 4.1.2)');
  });

  it('nav.js sets aria-current="page" on active tab (WCAG 1.3.1)', () => {
    const js = fs.readFileSync(path.join(ROOT, 'app/frontend/src/components/nav.js'), 'utf8');
    assert.ok(js.includes('aria-current'), 'active nav tab must use aria-current="page" (WCAG 1.3.1)');
  });

  it('router.js sets id="main-content" on page element (skip-link target)', () => {
    const js = fs.readFileSync(path.join(ROOT, 'app/frontend/src/router.js'), 'utf8');
    assert.ok(js.includes('main-content'), 'page element must have id="main-content" as skip-link target');
  });
});

// ── Suite 6: Report path configuration ───────────────────────────────────────

describe('Suite 6: report output configuration', () => {
  it('REPORT_DIR in audit script points to reports/accessibility/', () => {
    const scriptSrc = fs.readFileSync(path.join(ROOT, 'scripts/wcag_audit.js'), 'utf8');
    assert.ok(scriptSrc.includes('reports/accessibility'), 'audit report path must be reports/accessibility/');
  });

  it('reports/accessibility/ directory exists', () => {
    const reportDir = path.join(ROOT, 'reports/accessibility');
    assert.ok(fs.existsSync(reportDir), 'reports/accessibility/ directory must exist');
  });

  it('audit script writes both .json and .txt reports', () => {
    const scriptSrc = fs.readFileSync(path.join(ROOT, 'scripts/wcag_audit.js'), 'utf8');
    assert.ok(scriptSrc.includes('.json') && scriptSrc.includes('.txt'), 'both JSON and TXT reports required');
  });

  it('audit script generates timestamp in report filenames', () => {
    const scriptSrc = fs.readFileSync(path.join(ROOT, 'scripts/wcag_audit.js'), 'utf8');
    assert.ok(scriptSrc.includes('nowTs') || scriptSrc.includes('timestamp'), 'report filenames must include timestamp');
  });
});
