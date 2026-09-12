#!/usr/bin/env node
'use strict';

/**
 * WC-011 — anti-decoy guard for production release paths.
 *
 * THE DEFECT CLASS
 * ----------------
 * `.github/workflows/production.yml` was named "Production Deployment", was dispatchable,
 * targeted `prowork-production` / `prowork-api` in `us-east-1` — none of which exist — and
 * used `--force-new-deployment`, which redeploys the ALREADY-referenced task definition and
 * therefore cannot promote a newly built image. Measured across its last 15 runs: every one
 * reported run-level SUCCESS with both deploy jobs SKIPPED.
 *
 * Nothing was broken. It simply could not do what its name claimed, and it said "success"
 * while not doing it. That is the decoy: an operator under pressure reads a green
 * "Production Deployment" and concludes a deployment happened.
 *
 * This guard closes the CLASS, not the filename. A second ambiguous production-deploy
 * workflow must not be introducible.
 *
 * DESIGN: ALLOWLIST, NOT KEYWORD GREP
 * -----------------------------------
 * A keyword scan for "deploy" would punish honest tooling and fire on comments. Instead the
 * governed release paths are enumerated by filename, and only a narrow set of production
 * MUTATION patterns is prohibited outside them. Legitimate publish-only, test, and
 * credential-rotation tooling passes untouched.
 */

const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');

const ROOT = path.join(__dirname, '..', '..');
const WF_DIR = path.join(ROOT, '.github', 'workflows');

/**
 * Workflows permitted to touch production release machinery, each with a reason.
 * Adding a name here is the reviewable act — it is what makes a path governed.
 */
const GOVERNED_RELEASE_WORKFLOWS = Object.freeze({
  'wc-release-publish.yml':
    'WC-007 Stage A — publishes to GHCR on github.token. Publishes only; performs no ECS mutation.',
  'ci-publish-test.yml':
    'Disposable registry-publish proof. Manual dispatch, registry only, never deploys.',
});

/** ECS/production mutation verbs that must never appear in an ungoverned workflow. */
const PRODUCTION_MUTATIONS = [
  { re: /aws\s+ecs\s+update-service/, label: 'aws ecs update-service' },
  { re: /aws\s+ecs\s+register-task-definition/, label: 'aws ecs register-task-definition' },
  { re: /aws\s+ecs\s+run-task/, label: 'aws ecs run-task' },
  { re: /aws\s+ecs\s+delete-service/, label: 'aws ecs delete-service' },
];

/** Retired infrastructure. Its reappearance in an executable path is a regression. */
const OBSOLETE_TARGETS = ['prowork-production', 'prowork-staging', 'prowork-api'];

/**
 * GitHub Actions `on:` is the YAML 1.1 boolean `true`, not the string "on".
 * Reading doc['on'] silently yields undefined and the guard would pass vacuously —
 * exactly the failure mode this repo keeps closing. Read both, deliberately.
 */
function triggersOf(doc) {
  const on = doc && (doc.on !== undefined ? doc.on : doc[true]);
  if (on === undefined || on === null) return [];
  if (typeof on === 'string') return [on];
  if (Array.isArray(on)) return on.map(String);
  return Object.keys(on);
}

/** Does this workflow have any trigger that can start it? */
function isExecutable(triggers) {
  return triggers.length > 0;
}

function check(wfDir) {
  const WF = wfDir || WF_DIR;
  const findings = [];
  let filesChecked = 0;
  let executableChecked = 0;

  if (!fs.existsSync(WF)) {
    return { pass: false, findings: ['.github/workflows does not exist'], filesChecked: 0 };
  }

  const files = fs.readdirSync(WF).filter((f) => /\.ya?ml$/.test(f)).sort();
  if (files.length === 0) {
    return { pass: false, findings: ['no workflow files found — guard would be vacuous'], filesChecked: 0 };
  }

  for (const file of files) {
    const full = path.join(WF, file);
    const raw = fs.readFileSync(full, 'utf8');
    filesChecked++;

    let doc;
    try {
      doc = yaml.load(raw);
    } catch (e) {
      findings.push(`${file}: unparseable YAML (${e.message}) — a workflow that cannot be parsed cannot be cleared`);
      continue;
    }

    const triggers = triggersOf(doc);
    const executable = isExecutable(triggers);
    if (executable) executableChecked++;

    const governed = Object.prototype.hasOwnProperty.call(GOVERNED_RELEASE_WORKFLOWS, file);

    // Strip comments before scanning for mutations: a comment explaining why a workflow
    // is NOT the deploy path must not be read as the deploy path.
    const code = raw.replace(/^\s*#.*$/gm, '');

    for (const m of PRODUCTION_MUTATIONS) {
      if (!m.re.test(code)) continue;
      if (!executable) {
        findings.push(`${file}: contains "${m.label}" — non-executable, but the mutation text should be removed rather than left dormant`);
      } else if (!governed) {
        findings.push(
          `${file}: UNGOVERNED production mutation "${m.label}" in an executable workflow (triggers: ${triggers.join(', ')}). ` +
          `Production ECS mutation belongs to the WC-007 release path, not a workflow.`
        );
      }
    }

    // --force-new-deployment redeploys the ALREADY-referenced task definition. It is correct
    // for a credential-rotation placement and WRONG as an application release: it can never
    // promote a newly built image, so a workflow using it as a release reports success while
    // shipping nothing.
    if (/--force-new-deployment/.test(code) && executable) {
      findings.push(
        `${file}: uses --force-new-deployment in an executable workflow. That redeploys the ` +
        `currently referenced revision and cannot promote a new image; it is not an application ` +
        `release mechanism.`
      );
    }

    for (const t of OBSOLETE_TARGETS) {
      if (new RegExp(`(^|[^a-zA-Z0-9-])${t}([^a-zA-Z0-9-]|$)`).test(code) && executable) {
        findings.push(`${file}: references retired infrastructure "${t}" in an executable workflow`);
      }
    }
  }

  if (filesChecked === 0) findings.push('checked ZERO workflow files — guard is vacuous');

  return { pass: findings.length === 0, findings, filesChecked, executableChecked };
}

module.exports = { check, GOVERNED_RELEASE_WORKFLOWS, PRODUCTION_MUTATIONS, OBSOLETE_TARGETS, triggersOf };

if (require.main === module) {
  const r = check();
  console.log('┌─ WC-011 release-path guard ───────────────────────────────────');
  console.log(`│  workflows scanned  : ${r.filesChecked} (${r.executableChecked} executable)`);
  console.log(`│  governed paths     : ${Object.keys(GOVERNED_RELEASE_WORKFLOWS).join(', ')}`);
  console.log('└──────────────────────────────────────────────────────────────\n');
  if (r.findings.length) {
    r.findings.forEach((f) => console.error(`  ✗ ${f}`));
    console.error('\nRELEASE PATH GUARD: FAIL');
    process.exit(1);
  }
  console.log('RELEASE PATH GUARD: PASS — no ungoverned production deployment path.');
}
