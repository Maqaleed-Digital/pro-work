'use strict';

/**
 * Workflow shell-injection — static guard + BEHAVIOURAL proof.
 *
 * Suite 1 asserts the static rule (no ${{ }} in run:, via scripts/workflow_injection_guard.js).
 *
 * Suite 2 is the part that actually matters: it extracts the real `run:` script
 * from .github/workflows/web-assurance.yml, executes it under bash with hostile
 * values in the environment exactly as GitHub would supply them, and proves the
 * payloads never execute — no marker file appears, and the value round-trips as
 * literal data. Suite 3 proves the same harness DOES catch the pre-fix shape, so
 * a green Suite 2 cannot be vacuous.
 */

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs   = require('fs');
const os   = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..', '..');
const WF   = path.join(ROOT, '.github', 'workflows', 'web-assurance.yml');

// Payloads that must remain inert data.
const HOSTILE = [
  '$(touch MARKER)',
  '`touch MARKER`',
  '"; touch MARKER; #',
  "'; touch MARKER; #",
  '${{ malicious-looking-text }}',
  'https://ok.example.com/$(touch MARKER)',
  'a&touch MARKER&b',
  'a|touch MARKER|b',
  'a;touch MARKER;b',
  'a>MARKER',
  'line1\nline2',
  'quote"and\'quote',
  '$IFS$(touch MARKER)',
];

let tmp;
before(() => { tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'wf-inject-')); });
after(()  => { if (tmp) fs.rmSync(tmp, { recursive: true, force: true }); });

/** Pull one step's `run:` block out of the workflow by step name. */
function extractRunScript(stepName) {
  const lines = fs.readFileSync(WF, 'utf8').split('\n');
  const at = lines.findIndex(l => l.includes(`- name: ${stepName}`));
  assert.ok(at >= 0, `step not found in workflow: ${stepName}`);
  const runAt = lines.findIndex((l, i) => i > at && /^\s*run:\s*\|/.test(l));
  assert.ok(runAt > at, `run: block not found for step: ${stepName}`);
  const indent = lines[runAt].length - lines[runAt].trimStart().length;
  const body = [];
  for (let i = runAt + 1; i < lines.length; i++) {
    const l = lines[i];
    if (l.trim() === '') { body.push(''); continue; }
    if ((l.length - l.trimStart().length) <= indent) break;
    body.push(l.slice(indent + 2));
  }
  const script = body.join('\n').trim();
  assert.ok(script.length > 0, `empty run: script for step: ${stepName}`);
  return script;
}

/**
 * Run the real step script with hostile env, in an isolated cwd, with a fake
 * GITHUB_OUTPUT. Returns { status, stdout, stderr, outputs, markers }.
 */
function runStep(script, env) {
  const dir = fs.mkdtempSync(path.join(tmp, 'run-'));
  const outFile = path.join(dir, 'github_output');
  fs.writeFileSync(outFile, '');

  const res = spawnSync('bash', ['-c', script], {
    cwd: dir,
    encoding: 'utf8',
    env: { PATH: process.env.PATH, HOME: dir, GITHUB_OUTPUT: outFile, ...env },
  });

  const raw = fs.readFileSync(outFile, 'utf8');
  const outputs = {};
  for (const line of raw.split('\n')) {
    const eq = line.indexOf('=');
    if (eq > 0) outputs[line.slice(0, eq)] = line.slice(eq + 1);
  }
  // Any file created in the sandbox that we did not create is execution evidence.
  const markers = fs.readdirSync(dir).filter(f => f !== 'github_output');
  return { ...res, outputs, outputLineCount: raw.split('\n').filter(Boolean).length, markers, dir };
}

// ── Suite 1: static guard ────────────────────────────────────────────────────

describe('Suite 1: static injection guard', () => {
  it('guard script exists and is executable by node', () => {
    assert.ok(fs.existsSync(path.join(ROOT, 'scripts/workflow_injection_guard.js')));
  });

  it('every workflow passes the guard (no ${{ }} in run: except shell-inert)', () => {
    const r = spawnSync(process.execPath, ['scripts/workflow_injection_guard.js'],
      { cwd: ROOT, encoding: 'utf8' });
    assert.equal(r.status, 0, `guard failed:\n${r.stdout}\n${r.stderr}`);
    assert.match(r.stdout, /WORKFLOW INJECTION GUARD: PASS/);
  });

  it('the guard actually scans a non-zero number of workflows', () => {
    const r = spawnSync(process.execPath, ['scripts/workflow_injection_guard.js'],
      { cwd: ROOT, encoding: 'utf8' });
    const m = r.stdout.match(/Workflows scanned\s+:\s+(\d+)/);
    assert.ok(m, 'guard must report how many workflows it scanned');
    assert.ok(Number(m[1]) > 0, 'a guard that scanned zero workflows certifies nothing');
  });

  it('web-assurance.yml carries the untrusted event data in env:, not in run:', () => {
    const src = fs.readFileSync(WF, 'utf8');
    for (const v of ['EV_URL_OVERRIDE', 'EV_ENVIRONMENT_URL', 'EV_DEPLOY_ENVIRONMENT', 'SURFACE_URL', 'MWA_DEPLOY_ID']) {
      assert.ok(src.includes(v), `${v} must be declared as an env boundary`);
    }
    // Assert against the extracted run: SCRIPT, not the raw file — later steps
    // legitimately carry github.event.* inside their env: blocks, which is the
    // whole point of the fix.
    for (const step of ['Resolve target + trigger', 'Materialise manifest (URL override only for previews/dispatch)']) {
      const body = extractRunScript(step);
      assert.ok(!body.includes('${{'),
        `no \${{ }} expression may remain inside the script of step: ${step}`);
    }
  });
});

// ── Suite 2: behavioural proof — hostile values stay data ────────────────────

describe('Suite 2: hostile event values remain DATA, not shell instructions', () => {
  const script = () => extractRunScript('Resolve target + trigger');

  for (const payload of HOSTILE) {
    it(`url_override payload never executes: ${JSON.stringify(payload)}`, () => {
      const r = runStep(script(), {
        EV_EVENT_NAME: 'workflow_dispatch',
        EV_URL_OVERRIDE: payload,
        EV_ENVIRONMENT_URL: '',
        EV_DEPLOY_ENVIRONMENT: '',
      });
      assert.deepEqual(r.markers, [],
        `payload executed — created ${JSON.stringify(r.markers)}`);
      assert.ok(!fs.existsSync('/tmp/should-not-exist'), 'payload escaped the sandbox');
      // Either it was rejected (exit 8) or carried through as one literal line.
      if (r.status === 0) {
        assert.equal(r.outputLineCount, 2, 'exactly url= and trigger= may be written');
        assert.equal(r.outputs.url, payload.includes('\n') ? undefined : payload);
      } else {
        assert.equal(r.status, 8, `expected fail-closed exit 8, got ${r.status}: ${r.stderr}`);
      }
    });

    it(`deployment environment payload never executes: ${JSON.stringify(payload)}`, () => {
      const r = runStep(script(), {
        EV_EVENT_NAME: 'deployment_status',
        EV_URL_OVERRIDE: '',
        EV_ENVIRONMENT_URL: 'https://workcaptain.ai',
        EV_DEPLOY_ENVIRONMENT: payload,
      });
      assert.deepEqual(r.markers, [],
        `payload executed — created ${JSON.stringify(r.markers)}`);
      assert.equal(r.status, 0, `step should still succeed: ${r.stderr}`);
      // Hostile environment name must fall through to the default branch.
      assert.equal(r.outputs.trigger, 'pr-preview');
      assert.equal(r.outputs.url, 'https://workcaptain.ai');
    });
  }

  it('a newline in the URL cannot forge extra step outputs', () => {
    const r = runStep(script(), {
      EV_EVENT_NAME: 'workflow_dispatch',
      EV_URL_OVERRIDE: 'https://ok.example.com\nurl=https://evil.example.com\ntrigger=production-deploy',
      EV_ENVIRONMENT_URL: '',
      EV_DEPLOY_ENVIRONMENT: '',
    });
    assert.notEqual(r.status, 0, 'a multi-line URL must be refused, not written to GITHUB_OUTPUT');
    assert.equal(r.status, 8);
    assert.equal(r.outputLineCount, 0, 'nothing may be written when the value is refused');
  });

  it('a legitimate URL still flows through unchanged (semantics preserved)', () => {
    const r = runStep(script(), {
      EV_EVENT_NAME: 'workflow_dispatch',
      EV_URL_OVERRIDE: 'https://preview.workcaptain.ai/path?a=1&b=2',
      EV_ENVIRONMENT_URL: '',
      EV_DEPLOY_ENVIRONMENT: '',
    });
    assert.equal(r.status, 0, r.stderr);
    assert.equal(r.outputs.url, 'https://preview.workcaptain.ai/path?a=1&b=2');
    assert.equal(r.outputs.trigger, 'manual');
    assert.deepEqual(r.markers, []);
  });

  it('trigger taxonomy is unchanged for each event shape', () => {
    const cases = [
      [{ EV_EVENT_NAME: 'workflow_dispatch', EV_DEPLOY_ENVIRONMENT: '' }, 'manual'],
      [{ EV_EVENT_NAME: 'workflow_run',      EV_DEPLOY_ENVIRONMENT: '' }, 'production-deploy'],
      [{ EV_EVENT_NAME: 'deployment_status', EV_DEPLOY_ENVIRONMENT: 'Production' }, 'production-deploy'],
      [{ EV_EVENT_NAME: 'deployment_status', EV_DEPLOY_ENVIRONMENT: 'production' }, 'production-deploy'],
      [{ EV_EVENT_NAME: 'deployment_status', EV_DEPLOY_ENVIRONMENT: 'preview'    }, 'pr-preview'],
    ];
    for (const [env, expected] of cases) {
      const r = runStep(script(), { EV_URL_OVERRIDE: '', EV_ENVIRONMENT_URL: '', ...env });
      assert.equal(r.status, 0, r.stderr);
      assert.equal(r.outputs.trigger, expected,
        `event ${env.EV_EVENT_NAME}/${env.EV_DEPLOY_ENVIRONMENT} must map to ${expected}`);
    }
  });
});

// ── Suite 3: the harness can actually detect injection ───────────────────────

describe('Suite 3: negative control — the harness catches the pre-fix shape', () => {
  it('the ORIGINAL vulnerable pattern does execute the payload (proving Suite 2 is not vacuous)', () => {
    // This is the shape the workflow had before the fix: the expression evaluator
    // pasted event text straight into the script. Reproduced here by string
    // concatenation, which is exactly what GitHub did.
    const payload = '$(touch MARKER)';
    const vulnerable = `URL="${payload}"\nTRIG="workflow_dispatch"\nprintf 'url=%s\\n' "$URL" >> "$GITHUB_OUTPUT"`;
    const r = runStep(vulnerable, {});
    assert.deepEqual(r.markers, ['MARKER'],
      'the pre-fix pattern MUST execute the payload — otherwise Suite 2 proves nothing');
  });

  it('the FIXED pattern does not execute the same payload', () => {
    const fixed = `URL="\${EV_URL_OVERRIDE:-}"\nprintf 'url=%s\\n' "$URL" >> "$GITHUB_OUTPUT"`;
    const r = runStep(fixed, { EV_URL_OVERRIDE: '$(touch MARKER)' });
    assert.deepEqual(r.markers, [], 'the fixed pattern must not execute the payload');
    assert.equal(r.outputs.url, '$(touch MARKER)', 'the payload survives as literal data');
  });
});
