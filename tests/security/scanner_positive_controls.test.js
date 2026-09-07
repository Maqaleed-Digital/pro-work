'use strict';

/**
 * DL-SCANNER-NEG-CONTROL-001 — meta-tests for the positive-control harness.
 *
 * The harness proves scanners fire. These prove the HARNESS itself cannot pass
 * vacuously, and that the standard is actually wired into CI rather than merely
 * described in a commit message.
 *
 * Deliberately no live scanner binary is required here: these assert structure and
 * wiring, which is what CI can always check. The behavioural proof runs in the
 * jobs where the binaries exist (secret-scan.yml for gitleaks, ci.yml for actionlint).
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs   = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT    = path.join(__dirname, '..', '..');
const HARNESS = path.join(ROOT, 'scripts/scanner_positive_controls.js');
const src     = () => fs.readFileSync(HARNESS, 'utf8');
const wf      = n => fs.readFileSync(path.join(ROOT, '.github/workflows', n), 'utf8');

describe('Suite 1: the harness exists and cannot certify nothing', () => {
  it('harness script is present', () => {
    assert.ok(fs.existsSync(HARNESS));
  });

  it('rejects an unknown scanner name rather than passing', () => {
    const r = spawnSync(process.execPath, [HARNESS, 'not-a-scanner'],
      { cwd: ROOT, encoding: 'utf8' });
    assert.equal(r.status, 2, 'an unknown target must be a usage error, not a pass');
  });

  it('fails when zero controls ran', () => {
    assert.match(src(), /no control ran — this run certifies nothing/);
  });

  it('treats a missing scanner binary as UNVERIFIED, never as clean', () => {
    assert.match(src(), /UNVERIFIED, not clean/);
    assert.ok(!/skip/i.test(src().split('function have')[0]),
      'the harness must not describe skipping a control');
  });

  it('a silent scanner is a failure, not a note', () => {
    assert.match(src(), /a scanner did not fire on its own defect class/);
  });
});

describe('Suite 2: fixtures are synthetic and never enter the repository', () => {
  it('every fixture is written under a temp dir and removed', () => {
    assert.match(src(), /mkdtempSync/);
    assert.match(src(), /finally\s*\{\s*fs\.rmSync/);
  });

  it('no fixture literal is a contiguous credential in this source file', () => {
    // Values are assembled from split literals so the file itself never contains a
    // scannable credential — otherwise this repo's own secret scan would flag it.
    const body = src();
    assert.ok(!/AKIA[A-Z0-9]{16}/.test(body),
      'a contiguous AWS-shaped key must not appear literally in the harness');
    assert.ok(!/ghp_[A-Za-z0-9]{36}/.test(body),
      'a contiguous GitHub PAT shape must not appear literally in the harness');
  });

  it('records why the AWS documentation example key is unusable as a control', () => {
    assert.match(src(), /ALLOWLISTED by gitleaks/i);
    assert.match(src(), /silently never fires/i);
  });

  it('covers the credential class the live GHCR pull credential belongs to', () => {
    assert.match(src(), /github-pat/);
    assert.match(src(), /WC-003/);
  });

  it("exercises this repository's own hand-written gitleaks rules", () => {
    const conf = fs.readFileSync(path.join(ROOT, '.gitleaks.toml'), 'utf8');
    for (const rule of ['supabase-service-role-jwt', 'vercel-protection-bypass']) {
      assert.ok(conf.includes(rule), `${rule} must exist in .gitleaks.toml`);
      assert.ok(src().includes(rule),
        `${rule} is a bespoke regex — a positive control is the only thing separating it from a dead rule`);
    }
  });
});

describe('Suite 3: the standard is wired into CI, not just described', () => {
  it('secret-scan.yml runs the gitleaks positive control BEFORE the real scan', () => {
    const y = wf('secret-scan.yml');
    assert.ok(y.includes('scanner_positive_controls.js gitleaks'),
      'the gitleaks control must run in the job where gitleaks is installed');
    assert.ok(y.indexOf('scanner_positive_controls.js gitleaks') < y.indexOf('Scan full history'),
      'the control must run before the negative result it qualifies');
  });

  it('ci.yml actually runs actionlint (not only mentions it in a comment)', () => {
    const y = wf('ci.yml');
    assert.match(y, /^\s+run: actionlint\s*$/m,
      'actionlint must be an executed step; PR #70 claimed it ran when it did not');
  });

  it('ci.yml runs the actionlint positive control', () => {
    assert.ok(wf('ci.yml').includes('scanner_positive_controls.js actionlint'));
  });

  it('the bespoke workflow guard is retained alongside actionlint', () => {
    const y = wf('ci.yml');
    assert.ok(y.includes('workflow_injection_guard.js'));
    assert.ok(y.includes('actionlint'));
  });
});
