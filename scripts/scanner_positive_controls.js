#!/usr/bin/env node
'use strict';

/**
 * Scanner positive controls — DL-SCANNER-NEG-CONTROL-001.
 *
 * The ratified standard: a scanner's NEGATIVE result supports absence of a
 * specific defect class only when that class has a class-specific positive
 * control, OR equivalent explicit coverage proof shows the scanner actually
 * enumerates that class. A scanner catching a DIFFERENT class does not count.
 * Without either, the class is UNVERIFIED — not clean.
 *
 * This repository had exactly that problem: `gitleaks: no leaks found` was being
 * read as "no committed secrets", with nothing anywhere proving the scanner would
 * have detected one. That is an unfalsified negative.
 *
 * Every control here is synthetic, non-production, non-destructive, contains no
 * real secret, and performs no exploitation. The credential-shaped strings are
 * structured filler — repeated digits and sequential letters — recognisably fake to
 * a human while still matching the detector's shape. Nothing is written inside the
 * repository tree and nothing enters git history: every fixture is created in a temp
 * directory and removed in a finally block, and the literals in this file are
 * assembled from split fragments so the source itself never carries a contiguous
 * credential shape.
 *
 * Usage:  node scripts/scanner_positive_controls.js <gitleaks|actionlint|all>
 * Exit 0 only if every requested control fires as declared.
 */

const fs   = require('fs');
const os   = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..');

// Synthetic fixtures. Every value below is structured filler — repeated digits or
// sequential letters — so it is recognisably fake to a human while still matching
// the detector's shape. None is real, none is live, none is used against anything.
//
// A trap worth recording: AWS's own published example key (the AKIA... key ending
// in the literal word EXAMPLE, written split here so this file never itself
// contains a contiguous credential shape) is
// ALLOWLISTED by gitleaks' default configuration precisely because it appears in
// documentation. It therefore CANNOT serve as a positive control — a control built
// on it silently never fires and manufactures exactly the false confidence
// DL-SCANNER-NEG-CONTROL-001 exists to prevent. Verified with gitleaks 8.21.2.
const SYNTHETIC_SECRETS = [
  { cls: 'aws-access-key',
    text: "const id = '" + 'AKIA' + "Q3RMNOP7ZZTUVWXY';" },
  { cls: 'github-pat',
    // The class the live GHCR pull credential belongs to (WC-003).
    text: 'TOKEN=' + 'ghp_' + '0000111122223333444455556666777788' },
  { cls: 'private-key-block',
    text: '-----BEGIN ' + 'RSA PRIVATE KEY' + '-----\n'
        + 'MIIEowIBAAKCAQEAxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx\n'
        + '-----END ' + 'RSA PRIVATE KEY' + '-----' },
  { cls: 'supabase-service-role-jwt',
    // Exercises a rule hand-written in THIS repo's .gitleaks.toml. A bespoke regex
    // that never fires is indistinguishable from having no rule at all.
    text: "const jwt = '" + 'eyJhbGciOi' + "JIUzI1NiIsInR5cCI6IkpXVCJ9"
        + ".aaaac2VydmljZV9yb2xlYmJi.ccccccccccccccccccccdddd';" },
  { cls: 'vercel-protection-bypass',
    // The repository's other bespoke rule.
    text: 'VERCEL_AUTOMATION_BYPASS' + "_SECRET = 'aaaabbbbccccddddeeeeffff1234'" },
];

let failures = 0;
const results = [];

function record(scanner, cls, outcome, detail) {
  results.push({ scanner, cls, outcome, detail });
  const tag = outcome === 'FIRED' ? 'ok  ' : 'FAIL';
  console.log(`  ${tag}  ${scanner} / ${cls}: ${detail}`);
  if (outcome !== 'FIRED') failures++;
}

function withTempDir(fn) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'scanner-control-'));
  try { return fn(dir); } finally { fs.rmSync(dir, { recursive: true, force: true }); }
}

function have(bin) {
  return spawnSync(bin, ['--version'], { encoding: 'utf8' }).status === 0
      || spawnSync(bin, ['version'],   { encoding: 'utf8' }).status === 0;
}

// ── gitleaks: does it actually enumerate each credential class? ─────────────
function controlGitleaks() {
  console.log('\ngitleaks — classes: committed credential material');
  if (!have('gitleaks')) {
    record('gitleaks', 'ALL-CLASSES', 'MISSING',
      'gitleaks binary not available — every class is UNVERIFIED, not clean');
    return;
  }

  for (const { cls, text } of SYNTHETIC_SECRETS) {
    withTempDir(dir => {
      fs.writeFileSync(path.join(dir, 'synthetic_fixture.txt'),
        `SYNTHETIC positive-control fixture — structured filler, never a live value.\n${text}\n`);

      const res = spawnSync('gitleaks', [
        'detect', '--source', dir,
        '--config', path.join(ROOT, '.gitleaks.toml'),
        '--no-git', '--redact', '--no-banner', '--exit-code', '1',
      ], { encoding: 'utf8' });

      // exit 1 == leaks found == the detector enumerates this class.
      if (res.status === 1) {
        record('gitleaks', cls, 'FIRED', 'detected the synthetic fixture');
      } else {
        record('gitleaks', cls, 'SILENT',
          `NOT detected (exit ${res.status}) — "no leaks found" is UNVERIFIED for this class`);
      }
    });
  }
}

// ── actionlint: what does its injection check actually enumerate? ────────────
// Two controls. The first proves the checker is switched on at all. The second is
// the coverage-boundary proof that justifies keeping the purpose-built guard:
// actionlint's untrusted-input list does NOT include the deployment_status /
// deployment / dispatch-input contexts this repository's workflows actually use.
function controlActionlint() {
  console.log('\nactionlint — class: untrusted event data in run: (script injection)');
  const bin = process.env.ACTIONLINT_BIN || 'actionlint';
  if (!have(bin)) {
    record('actionlint', 'script-injection', 'MISSING',
      'actionlint binary not available — the class is UNVERIFIED, not clean');
    return;
  }

  const probe = (name, expr, onEvent) => withTempDir(dir => {
    const wf = path.join(dir, '.github', 'workflows');
    fs.mkdirSync(wf, { recursive: true });
    fs.writeFileSync(path.join(wf, 'probe.yml'),
      `name: probe\non:\n${onEvent}\njobs:\n  p:\n    runs-on: ubuntu-latest\n` +
      `    steps:\n      - run: echo "\${{ ${expr} }}"\n`);
    const res = spawnSync(bin, ['.github/workflows/probe.yml'],
      { cwd: dir, encoding: 'utf8' });
    return /potentially untrusted/i.test(res.stdout + res.stderr);
  });

  const known = probe('known', 'github.event.issue.title', '  issues:\n    types: [opened]\n');
  if (known) {
    record('actionlint', 'script-injection', 'FIRED',
      'flags github.event.issue.title — the injection checker is active');
  } else {
    record('actionlint', 'script-injection', 'SILENT',
      'did NOT flag a known-untrusted expression; actionlint results are UNVERIFIED');
  }

  // Coverage boundary. This one is EXPECTED not to fire; that is the finding.
  const boundary = probe('boundary', 'github.event.deployment_status.environment_url',
    '  deployment_status: {}\n');
  if (boundary) {
    record('actionlint', 'coverage-boundary', 'FIRED',
      'actionlint now also flags deployment_status.* — scope has widened since 1.7.7');
  } else {
    console.log('  note  actionlint / coverage-boundary: does NOT flag ' +
      'github.event.deployment_status.environment_url — this is the documented gap, ' +
      'and is why scripts/workflow_injection_guard.js is required alongside it.');
    results.push({ scanner: 'actionlint', cls: 'coverage-boundary',
      outcome: 'DOCUMENTED-GAP', detail: 'deployment_status.* not enumerated' });
  }
}

// ── run ──────────────────────────────────────────────────────────────────────
const which = (process.argv[2] || 'all').toLowerCase();
const valid = ['gitleaks', 'actionlint', 'all'];
if (!valid.includes(which)) {
  console.error(`usage: node scripts/scanner_positive_controls.js <${valid.join('|')}>`);
  process.exit(2);
}

console.log('┌─ Scanner positive controls (DL-SCANNER-NEG-CONTROL-001) ──────');
console.log(`│  Requested : ${which}`);
console.log('│  Fixtures  : synthetic, temp-only, never written into the repo');
console.log('└──────────────────────────────────────────────────────────────');

if (which === 'gitleaks'   || which === 'all') controlGitleaks();
if (which === 'actionlint' || which === 'all') controlActionlint();

const fired = results.filter(r => r.outcome === 'FIRED').length;
console.log('\n' + '─'.repeat(62));
console.log(`Controls run    : ${results.length}`);
console.log(`Controls fired  : ${fired}`);
console.log(`Failures        : ${failures}`);

if (results.length === 0) {
  console.error('\nERROR: no control ran — this run certifies nothing.');
  process.exit(1);
}
if (failures > 0) {
  console.error('\nERROR: a scanner did not fire on its own defect class. Its negative ' +
                'results are UNVERIFIED, not clean.');
  process.exit(1);
}
console.log('\nSCANNER POSITIVE CONTROLS: PASS');
process.exit(0);
