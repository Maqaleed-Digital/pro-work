#!/usr/bin/env node
'use strict';

/**
 * Workflow shell-injection guard.
 *
 * A GitHub Actions `${{ ... }}` expression is substituted by the expression
 * evaluator BEFORE the shell ever sees the script. Any event-supplied text placed
 * inside a `run:` block is therefore shell SOURCE, not shell DATA: a value holding
 * $(...), a backtick, or a quote becomes syntax. The fix is always the same —
 * carry the value in `env:` and reference it as "$VAR", which bash does not
 * re-parse.
 *
 * Why this exists alongside actionlint: actionlint's untrusted-input check works
 * off a fixed list of known-untrusted expression paths. That list does NOT include
 * github.event.deployment_status.*, github.event.deployment.*, or workflow_dispatch
 * inputs, so it reports web-assurance.yml clean. Verified 7 Sep 2026 with
 * actionlint 1.7.7: a probe using github.event.issue.title is flagged, the
 * deployment_status paths are not. Run both; neither alone is sufficient.
 *
 * Policy enforced here: NO `${{ }}` expression of any kind inside a `run:` block,
 * except an explicit allowlist of GitHub-controlled, shell-inert values. Banning
 * the construct rather than a list of bad names is what makes the rule hold for
 * event fields nobody has enumerated yet.
 *
 * Exit 0 clean, 1 on any violation.
 */

const fs   = require('fs');
const path = require('path');

const ROOT     = path.join(__dirname, '..');
const WF_DIR   = path.join(ROOT, '.github', 'workflows');

// Values GitHub controls entirely and which cannot carry shell metacharacters.
// Everything else must cross into the step through `env:`.
const SHELL_INERT = new Set([
  'github.sha',            // 40 hex
  'github.run_id',         // integer
  'github.run_number',     // integer
  'github.run_attempt',    // integer
  'github.job',            // job id from the workflow file itself
  'github.repository',     // owner/name, validated by GitHub
  'github.actor',          // login, validated by GitHub
  'github.workspace',      // runner-controlled path
  'runner.os',
  'runner.temp',
  'runner.arch',
]);

function listWorkflows() {
  if (!fs.existsSync(WF_DIR)) return [];
  return fs.readdirSync(WF_DIR)
    .filter(f => f.endsWith('.yml') || f.endsWith('.yaml'))
    .map(f => path.join(WF_DIR, f))
    .sort();
}

/**
 * Find every `${{ ... }}` that sits inside a `run:` block.
 *
 * Deliberately a line/indentation scan rather than a YAML parse: it needs the
 * physical line numbers of the script text, and it must not depend on a YAML
 * library being installed for a security check to run.
 */
function findExpressionsInRun(file) {
  const lines = fs.readFileSync(file, 'utf8').split('\n');
  const hits  = [];
  let inRun = false;
  let runIndent = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const open = line.match(/^(\s*)-?\s*run:\s*[|>]?[-+]?\s*$/)
              || line.match(/^(\s*)-?\s*run:\s+\S/);
    if (open) {
      inRun = true;
      runIndent = open[1].length;
      // A single-line `run: cmd` still counts — scan this very line.
      if (/run:\s+\S/.test(line)) {
        for (const m of line.matchAll(/\$\{\{([^}]*)\}\}/g)) {
          hits.push({ line: i + 1, expr: m[1].trim(), text: line.trim() });
        }
        inRun = /run:\s*[|>]/.test(line);
      }
      continue;
    }
    if (inRun) {
      const indent = line.length - line.trimStart().length;
      if (line.trim() !== '' && indent <= runIndent) { inRun = false; continue; }
      for (const m of line.matchAll(/\$\{\{([^}]*)\}\}/g)) {
        hits.push({ line: i + 1, expr: m[1].trim(), text: line.trim() });
      }
    }
  }
  return hits;
}

// An expression is permitted only if every alternative in a `a || b` chain is inert.
function isAllowed(expr) {
  return expr.split('||').map(p => p.trim()).every(p => SHELL_INERT.has(p));
}

const files = listWorkflows();
console.log('┌─ Workflow shell-injection guard ──────────────────────────────');
console.log(`│  Workflows scanned : ${files.length}`);
console.log('│  Rule              : no ${{ }} inside run:, except shell-inert values');
console.log('└──────────────────────────────────────────────────────────────\n');

if (files.length === 0) {
  console.error('ERROR: no workflow files found — the guard would certify nothing.');
  process.exit(1);
}

let violations = 0;
let expressionsChecked = 0;

for (const file of files) {
  const rel  = path.relative(ROOT, file);
  const hits = findExpressionsInRun(file);
  expressionsChecked += hits.length;
  const bad  = hits.filter(h => !isAllowed(h.expr));

  if (bad.length === 0) {
    console.log(`  ok    ${rel}  (${hits.length} expression(s) in run:, all shell-inert)`);
    continue;
  }
  for (const h of bad) {
    console.error(`  FAIL  ${rel}:${h.line}  \${{ ${h.expr} }}`);
    console.error(`        ${h.text}`);
    console.error('        -> move this value into the step\'s env: and use "$VAR" in the script.');
    violations++;
  }
}

console.log('\n' + '─'.repeat(62));
console.log(`Workflows scanned      : ${files.length}`);
console.log(`Expressions in run:    : ${expressionsChecked}`);
console.log(`Violations             : ${violations}`);

if (violations > 0) {
  console.error('\nERROR: event data spliced into shell source. Deploy/CI blocked.');
  process.exit(1);
}
console.log('\nWORKFLOW INJECTION GUARD: PASS');
process.exit(0);
