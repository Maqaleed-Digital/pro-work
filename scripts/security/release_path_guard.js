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
 * Nothing was broken. It simply could not do what its name claimed, and said "success"
 * while not doing it. That is the decoy: an operator under pressure reads a green
 * "Production Deployment" and concludes a deployment happened.
 *
 * This guard closes the CLASS, not the filename.
 *
 * DESIGN: ALLOWLIST, NOT KEYWORD GREP
 * -----------------------------------
 * A keyword scan for "deploy" would punish honest tooling and fire on comments. Instead the
 * governed release paths are enumerated by filename, and only a narrow set of production
 * MUTATION patterns is prohibited outside them.
 *
 * DESIGN: NO EXTERNAL DEPENDENCIES
 * --------------------------------
 * Learned in CI rather than by inspection. A first version required js-yaml, which resolved
 * locally (transitively via lighthouse) and failed in CI with "Cannot find module 'js-yaml'":
 * ci.yml's app job runs `npm ci` in app/ only, so the gate executes from a root with no
 * node_modules. A guard that cannot load is a guard that does not run. Every other gate
 * script here is dependency-free; this one now is too.
 */

const fs = require('fs');
const path = require('path');

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
 * Trigger extraction without a YAML library.
 *
 * Parsing is structural and narrow: the top-level `on:` block's first-level keys. That also
 * sidesteps the YAML 1.1 / 1.2 divergence entirely — under YAML 1.1 (PyYAML, js-yaml 3.x)
 * `on:` becomes the boolean `true` and `doc['on']` is undefined, which would clear every
 * workflow vacuously. Reading the text depends on neither schema, so `on:` and a literal
 * `true:` are both accepted.
 */
function triggersOf(source) {
  const lines = String(source).split(/\r?\n/);
  const out = [];
  for (let i = 0; i < lines.length; i++) {
    const m = /^(on|true)\s*:(.*)$/.exec(lines[i]); // top level only: no leading whitespace
    if (!m) continue;
    const inline = m[2].trim();
    if (inline && !inline.startsWith('#')) {
      const arr = /^\[(.*)\]$/.exec(inline);          // on: [push, pull_request]
      const items = arr ? arr[1].split(',') : [inline]; // on: push
      for (const it of items) {
        const v = it.trim().replace(/^['"]|['"]$/g, '');
        if (v) out.push(v);
      }
      return out;
    }
    let indent = null;
    for (let j = i + 1; j < lines.length; j++) {
      const line = lines[j];
      if (!line.trim() || /^\s*#/.test(line)) continue;
      if (!/^\s/.test(line)) break;                   // back at column 0: block ended
      const lead = line.match(/^(\s*)/)[1].length;
      if (indent === null) indent = lead;
      if (lead > indent) continue;                    // nested detail: branches:, tags:, inputs:
      const k = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*:/.exec(line);
      if (k) out.push(k[1]);
    }
    return out;
  }
  return out;
}

/** A workflow must declare both a trigger block and jobs to be readable at all. */
function isStructurallyValid(source) {
  return /^(on|true)\s*:/m.test(source) && /^jobs\s*:/m.test(source);
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
    const raw = fs.readFileSync(path.join(WF, file), 'utf8');
    filesChecked++;

    if (!isStructurallyValid(raw)) {
      findings.push(`${file}: unparseable or structurally invalid (no top-level on:/jobs:) — a workflow that cannot be read cannot be cleared`);
      continue;
    }

    const triggers = triggersOf(raw);
    const executable = triggers.length > 0;
    if (executable) executableChecked++;

    const governed = Object.prototype.hasOwnProperty.call(GOVERNED_RELEASE_WORKFLOWS, file);

    // Strip comments before scanning: a comment explaining why a workflow is NOT the deploy
    // path must not be read as the deploy path. Without this, the retired production.yml's
    // own header — which documents the old command so the history is not erased — would trip
    // the guard and force the explanation to be deleted to satisfy it.
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

    // --force-new-deployment redeploys the ALREADY-referenced task definition. Correct for a
    // credential-rotation placement; WRONG as an application release, because it can never
    // promote a newly built image — so a workflow using it reports success while shipping nothing.
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

module.exports = {
  check, GOVERNED_RELEASE_WORKFLOWS, PRODUCTION_MUTATIONS, OBSOLETE_TARGETS,
  triggersOf, isStructurallyValid,
};

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
