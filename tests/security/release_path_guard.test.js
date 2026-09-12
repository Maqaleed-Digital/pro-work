'use strict';

/**
 * WC-011 — anti-decoy release-path controls.
 *
 * The defect being closed is a CLASS, not a filename: a workflow that presents itself as a
 * production deployment, is executable, and either targets infrastructure that does not
 * exist or uses a command that cannot promote a new image — while reporting success.
 *
 * Every control writes a real workflow file into a temp directory and asserts the
 * perturbation landed before believing the guard's verdict. Nothing here touches
 * .github/workflows.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { check, GOVERNED_RELEASE_WORKFLOWS, triggersOf, isStructurallyValid } =
  require('../../scripts/security/release_path_guard.js');

function withWorkflows(files) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wc011-'));
  for (const [name, body] of Object.entries(files)) fs.writeFileSync(path.join(dir, name), body);
  return dir;
}

const ECS_DEPLOY = (extra = '') => `name: Legacy Deploy
on:
  push:
    branches: [main]
${extra}
jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - name: Deploy
        run: |
          aws ecs update-service --cluster some-production --service some-api
`;

test('the real repository tree PASSES after retirement', () => {
  const r = check();
  assert.equal(r.pass, true, `repo has an ungoverned deploy path: ${JSON.stringify(r.findings)}`);
  assert.ok(r.filesChecked > 0, 'a guard that scanned zero workflows must never report clean');
  assert.ok(r.filesChecked >= 8, `only ${r.filesChecked} workflows scanned`);
});

test('triggersOf reads the on: block without a YAML library, in every shape', () => {
  // Structural text parsing, deliberately. A first version of this guard required js-yaml,
  // which resolved locally via a transitive dep and failed in CI with
  // "Cannot find module 'js-yaml'" — ci.yml's app job installs only app/ deps, so the gate
  // runs from a root with no node_modules. A guard that cannot load does not run.
  //
  // Reading the text also sidesteps the YAML 1.1 / 1.2 divergence: under YAML 1.1 the `on:`
  // key becomes the boolean true, and a parser-based guard reading doc['on'] would see no
  // triggers and clear every workflow vacuously.
  assert.deepEqual(triggersOf('name: X\non:\n  push:\n    branches: [main]\n'), ['push']);
  assert.deepEqual(
    triggersOf('on:\n  push:\n    tags: [\'v*\']\n  workflow_dispatch:\n').sort(),
    ['push', 'workflow_dispatch']
  );
  assert.deepEqual(triggersOf('on: [push, pull_request]\n'), ['push', 'pull_request']);
  assert.deepEqual(triggersOf('on: push\n'), ['push']);
  // A YAML 1.1 writer may emit the key literally as `true:` — accepted too.
  assert.deepEqual(triggersOf('true:\n  push:\n    branches: [main]\n'), ['push']);
  // Nested detail must not be mistaken for a trigger.
  assert.ok(!triggersOf('on:\n  push:\n    branches: [main]\n').includes('branches'));
  // No triggers at all => not executable.
  assert.deepEqual(triggersOf('name: X\njobs:\n  a:\n    runs-on: x\n'), []);
});

test('NC-WC011-01 — dispatchable legacy production deploy workflow: FAIL', () => {
  const dir = withWorkflows({ 'legacy.yml': ECS_DEPLOY('  workflow_dispatch:\n') });
  assert.match(fs.readFileSync(path.join(dir, 'legacy.yml'), 'utf8'), /workflow_dispatch/);
  const r = check(dir);
  assert.equal(r.pass, false);
  assert.ok(r.findings.some(f => /UNGOVERNED production mutation/.test(f)), JSON.stringify(r.findings));
});

test('NC-WC011-02 — ECS update-service to an ungoverned target: FAIL', () => {
  const r = check(withWorkflows({ 'rogue.yml': ECS_DEPLOY() }));
  assert.equal(r.pass, false);
  assert.ok(r.findings.some(f => /aws ecs update-service/.test(f)), JSON.stringify(r.findings));
});

test('NC-WC011-03 — --force-new-deployment as an application release path: FAIL', () => {
  const dir = withWorkflows({
    'release.yml': `name: Release
on:
  push:
    tags: ['v*']
jobs:
  go:
    runs-on: ubuntu-latest
    steps:
      - run: aws ecs update-service --cluster c --service s --force-new-deployment
`,
  });
  const r = check(dir);
  assert.equal(r.pass, false);
  assert.ok(r.findings.some(f => /--force-new-deployment/.test(f)), JSON.stringify(r.findings));
  assert.ok(r.findings.some(f => /cannot promote a new image/.test(f)),
    'the finding must explain WHY, not just match a string');
});

test('NC-WC011-04 — retired prowork-* infrastructure reintroduced: FAIL', () => {
  const dir = withWorkflows({
    'old.yml': `name: Old
on:
  workflow_dispatch:
jobs:
  d:
    runs-on: ubuntu-latest
    steps:
      - run: aws ecs update-service --cluster prowork-production --service prowork-api
`,
  });
  const r = check(dir);
  assert.equal(r.pass, false);
  for (const t of ['prowork-production', 'prowork-api']) {
    assert.ok(r.findings.some(f => f.includes(t)), `retired target ${t} not reported`);
  }
});

test('NC-WC011-05 — a publish-only (Stage A) workflow: PASS', () => {
  const dir = withWorkflows({
    'wc-release-publish.yml': `name: wc-release-publish
on:
  workflow_dispatch:
permissions:
  contents: read
  packages: write
jobs:
  publish:
    runs-on: ubuntu-latest
    steps:
      - run: echo build and push to ghcr
`,
  });
  assert.ok(Object.prototype.hasOwnProperty.call(GOVERNED_RELEASE_WORKFLOWS, 'wc-release-publish.yml'));
  assert.equal(check(dir).pass, true);
});

test('NC-WC011-06 — governed WC-007 tooling is not penalised: PASS', () => {
  // Governed by explicit allowlist, not by guessing from content.
  const dir = withWorkflows({
    'ci-publish-test.yml': `name: ci-publish-test
on:
  workflow_dispatch:
jobs:
  p:
    runs-on: ubuntu-latest
    steps:
      - run: echo disposable publish proof
`,
  });
  assert.equal(check(dir).pass, true);
});

test('NC-WC011-07 — an ordinary non-deploy workflow with workflow_dispatch: PASS', () => {
  const dir = withWorkflows({
    'lint.yml': `name: lint
on:
  workflow_dispatch:
  pull_request:
jobs:
  l:
    runs-on: ubuntu-latest
    steps:
      - run: npm run lint
`,
  });
  assert.equal(check(dir).pass, true, 'dispatchability alone must not be an offence');
});

test('NC-WC011-08 — no executable legacy path present: PASS', () => {
  const dir = withWorkflows({
    'tests.yml': `name: tests
on:
  push:
    branches: [main]
jobs:
  t:
    runs-on: ubuntu-latest
    steps:
      - run: npm test
`,
  });
  assert.equal(check(dir).pass, true);
});

test('a comment explaining the retired path is NOT read as the path', () => {
  // The retired production.yml documents the old command in its header. A keyword grep
  // would fire on that and force the explanation to be deleted to satisfy the guard.
  const dir = withWorkflows({
    'documented.yml': `# This workflow does NOT deploy. It used to run:
#   aws ecs update-service --cluster prowork-production --force-new-deployment
name: Documented
on:
  push:
    branches: [main]
jobs:
  t:
    runs-on: ubuntu-latest
    steps:
      - run: npm test
`,
  });
  assert.equal(check(dir).pass, true, 'comments must not be treated as executable content');
});

test('a structurally invalid workflow FAILS rather than being skipped', () => {
  const broken = 'name: X\n  bad: [unclosed\n';
  assert.equal(isStructurallyValid(broken), false, 'precondition: fixture must be invalid');
  const dir = withWorkflows({ 'broken.yml': broken });
  const r = check(dir);
  assert.equal(r.pass, false);
  assert.ok(r.findings.some(f => /unparseable or structurally invalid/.test(f)));
});

test('an empty workflow directory FAILS rather than passing vacuously', () => {
  const r = check(withWorkflows({}));
  assert.equal(r.pass, false);
  assert.ok(r.findings.some(f => /no workflow files/.test(f)));
});
