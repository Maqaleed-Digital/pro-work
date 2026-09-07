'use strict';

/**
 * Web Assurance trust boundary — MAQ-WAAP-001 H3.
 *
 * The product repository is PUBLIC; the central assurance repository
 * (Waheebow/maqaleed-web-assurance) is PRIVATE and under a different owner, so the
 * repository-scoped GITHUB_TOKEN cannot read it. web-assurance.yml therefore carries one
 * narrowly scoped read-only credential, MWA_READ_TOKEN. This suite proves WHO CAN REACH IT.
 *
 * Two different kinds of proof are used, and they are not interchangeable:
 *
 *   TOPOLOGY (Suite A) — an event that is absent from `on:` cannot start the workflow at all.
 *     This is read straight off the workflow file. No predicate is involved, and none should be:
 *     faking a deployment_status expression result would prove nothing about a trigger that no
 *     longer exists. This is the basis on which deployment_status is excluded.
 *
 *   PREDICATE (Suite B) — for events that CAN start the workflow, the job-level `if:` decides
 *     whether the secret-bearing job runs. A real GitHub event cannot be forged locally, so this
 *     suite parses the ACTUAL `if:` expression out of the workflow and evaluates it against
 *     synthetic contexts using the small evaluator below.
 *
 *     THE EVALUATOR IS A MIRROR, NOT GITHUB. It implements only the subset of the expression
 *     language the predicate uses (|| && == , string literals, parenthesised groups, context
 *     paths). It is not the GitHub runtime and must never be described as such. Suite C is what
 *     stops the mirror being trusted blindly: it feeds the PRE-PATCH predicate to the same
 *     evaluator and requires it to ACCEPT a deployment_status event. A mirror that returned false
 *     for everything would fail Suite C, so a green Suite B cannot be vacuous.
 *
 * A job is not a secret sandbox. Splitting jobs does not contain a secret; only unreachability
 * does. That is why the deployment_status repair is trigger removal rather than a job split.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs   = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const WF   = path.join(ROOT, '.github', 'workflows', 'web-assurance.yml');
const SRC  = fs.readFileSync(WF, 'utf8');

const THIS_REPO = 'Maqaleed-Digital/pro-work';

// ── expression mirror ────────────────────────────────────────────────────────

function tokenize(expr) {
  const out = [];
  let i = 0;
  while (i < expr.length) {
    const c = expr[i];
    if (/\s/.test(c)) { i++; continue; }
    if (c === '(' || c === ')') { out.push({ t: c }); i++; continue; }
    if (expr.startsWith('&&', i)) { out.push({ t: '&&' }); i += 2; continue; }
    if (expr.startsWith('||', i)) { out.push({ t: '||' }); i += 2; continue; }
    if (expr.startsWith('==', i)) { out.push({ t: '==' }); i += 2; continue; }
    if (expr.startsWith('!=', i)) { out.push({ t: '!=' }); i += 2; continue; }
    if (c === "'") {
      const end = expr.indexOf("'", i + 1);
      assert.ok(end > i, `unterminated string literal in: ${expr}`);
      out.push({ t: 'str', v: expr.slice(i + 1, end) });
      i = end + 1;
      continue;
    }
    const m = /^[A-Za-z_][A-Za-z0-9_.\-]*/.exec(expr.slice(i));
    assert.ok(m, `unsupported token at offset ${i} in: ${expr}`);
    out.push({ t: 'path', v: m[0] });
    i += m[0].length;
  }
  return out;
}

/** Resolve a dotted context path; a missing segment yields undefined, as GitHub yields null. */
function resolvePath(p, ctx) {
  let cur = ctx;
  for (const seg of p.split('.')) {
    if (cur === null || cur === undefined || typeof cur !== 'object') return undefined;
    cur = cur[seg];
  }
  return cur;
}

function parse(tokens, ctx) {
  let pos = 0;
  const peek = () => tokens[pos];

  function primary() {
    const tk = tokens[pos];
    assert.ok(tk, 'unexpected end of expression');
    if (tk.t === '(') { pos++; const v = orExpr(); assert.equal(tokens[pos] && tokens[pos].t, ')', 'unbalanced parenthesis'); pos++; return v; }
    if (tk.t === 'str')  { pos++; return tk.v; }
    if (tk.t === 'path') { pos++; return resolvePath(tk.v, ctx); }
    throw new Error(`unexpected token ${tk.t}`);
  }
  function cmpExpr() {
    let left = primary();
    while (peek() && (peek().t === '==' || peek().t === '!=')) {
      const op = tokens[pos++].t;
      const right = primary();
      left = op === '==' ? left === right : left !== right;
    }
    return left;
  }
  function andExpr() {
    let left = cmpExpr();
    while (peek() && peek().t === '&&') { pos++; const right = cmpExpr(); left = left && right; }
    return left;
  }
  function orExpr() {
    let left = andExpr();
    while (peek() && peek().t === '||') { pos++; const right = andExpr(); left = left || right; }
    return left;
  }
  const value = orExpr();
  assert.equal(pos, tokens.length, 'trailing tokens in expression');
  return value;
}

const evaluate = (expr, ctx) => parse(tokenize(expr), ctx) === true;

// ── read the real workflow ───────────────────────────────────────────────────

/** Top-level keys of the `on:` block, by indentation scan (no YAML library dependency). */
function triggerKeys() {
  const lines = SRC.split('\n');
  const at = lines.findIndex(l => /^on:\s*$/.test(l));
  assert.ok(at >= 0, 'no top-level `on:` block found');
  const keys = [];
  for (let i = at + 1; i < lines.length; i++) {
    const l = lines[i];
    if (l.trim() === '' || /^\s*#/.test(l)) continue;
    if (!/^\s/.test(l)) break;                       // dedent to column 0 ends the block
    const m = /^ {2}([A-Za-z_][A-Za-z0-9_]*):/.exec(l);
    if (m) keys.push(m[1]);
  }
  return keys;
}

/**
 * Split the steps: list into step bodies. A naive split on "- name: " sweeps the NEXT step's
 * leading comment block into the previous step, which produced a false positive here. A step ends
 * at the next step marker, at a comment sitting at step indent (those introduce the next step), or
 * at any dedent out of the steps: list.
 */
function stepBodies() {
  const lines = SRC.split('\n');
  const out = [];
  let cur = null;
  const close = () => { if (cur) out.push(cur.join('\n')); cur = null; };
  for (const l of lines) {
    if (/^ {6}- (name|uses):/.test(l)) { close(); cur = [l]; continue; }
    if (!cur) continue;
    if (/^ {6}#/.test(l)) { close(); continue; }
    if (l.trim() !== '' && /^ {0,5}\S/.test(l)) { close(); continue; }
    cur.push(l);
  }
  close();
  return out;
}

const stepNamed = (prefix) => stepBodies().find(b => b.includes(`- name: ${prefix}`));

/** The job-level `if:` expression for jobs.assure, folded to one line. */
function jobPredicate() {
  const lines = SRC.split('\n');
  const at = lines.findIndex(l => /^\s{4}if:\s*>-\s*$/.test(l));
  assert.ok(at >= 0, 'no folded job-level `if:` found');
  const indent = lines[at].length - lines[at].trimStart().length;
  const body = [];
  for (let i = at + 1; i < lines.length; i++) {
    const l = lines[i];
    if (l.trim() === '') break;
    if ((l.length - l.trimStart().length) <= indent) break;
    body.push(l.trim());
  }
  assert.ok(body.length > 0, 'job predicate is empty');
  return body.join(' ');
}

const PREDICATE = jobPredicate();

/** A workflow_run context. Overrides let each control vary exactly one dimension. */
function runCtx(over = {}) {
  return {
    github: {
      event_name: 'workflow_run',
      repository: THIS_REPO,
      event: {
        workflow_run: {
          conclusion: 'success',
          head_branch: 'main',
          name: 'Production Deployment',
          head_repository: { full_name: THIS_REPO },
          ...(over.workflow_run || {}),
        },
      },
      ...(over.github || {}),
    },
  };
}

// ── Suite A: topology ────────────────────────────────────────────────────────

describe('Suite A: trigger surface topology (CONTROL F)', () => {
  it('deployment_status is absent from the workflow trigger surface', () => {
    const keys = triggerKeys();
    assert.ok(!keys.includes('deployment_status'),
      `deployment_status must not appear in on:; found ${JSON.stringify(keys)}`);
  });

  it('the only supported triggers are workflow_dispatch and workflow_run', () => {
    assert.deepEqual(triggerKeys().sort(), ['workflow_dispatch', 'workflow_run']);
  });

  it('DEPLOYMENT_STATUS_CAN_START_WORKFLOW=NO on trigger-absence grounds', () => {
    // The basis is TRIGGER_ABSENT. No expression is evaluated here on purpose.
    assert.ok(!triggerKeys().includes('deployment_status'));
  });

  it('the workflow name filter exists at TRIGGER level, not only in the job predicate', () => {
    assert.match(SRC, /workflows:\s*\["Production Deployment"\]/,
      'trigger-level workflows: filter must remain — it is the primary name control');
  });
});

// ── Suite B: predicate controls ──────────────────────────────────────────────

describe('Suite B: job predicate — who can reach MWA_READ_TOKEN', () => {
  it('CONTROL E — trusted main Production Deployment success is ACCEPTED', () => {
    assert.equal(evaluate(PREDICATE, runCtx()), true);
  });

  it('CONTROL A — fork-originated workflow_run is REJECTED', () => {
    assert.equal(evaluate(PREDICATE, runCtx({
      workflow_run: { head_repository: { full_name: 'attacker-fork/pro-work' } },
    })), false);
  });

  it('CONTROL B — non-main branch workflow_run is REJECTED', () => {
    assert.equal(evaluate(PREDICATE, runCtx({
      workflow_run: { head_branch: 'feature/test' },
    })), false);
  });

  it('CONTROL C — wrong upstream workflow name is REJECTED (defence in depth)', () => {
    // Primary basis is the trigger-level workflows: filter asserted in Suite A;
    // this job-level equality is a second, redundant control.
    assert.equal(evaluate(PREDICATE, runCtx({
      workflow_run: { name: 'Untrusted Workflow' },
    })), false);
  });

  it('CONTROL D — failed upstream Production Deployment is REJECTED', () => {
    assert.equal(evaluate(PREDICATE, runCtx({
      workflow_run: { conclusion: 'failure' },
    })), false);
  });

  it('CONTROL G — workflow_dispatch is ACCEPTED as the diagnostic path', () => {
    assert.equal(evaluate(PREDICATE, {
      github: { event_name: 'workflow_dispatch', repository: THIS_REPO, event: {} },
    }), true);
  });

  it('a deployment_status event would not satisfy the predicate either', () => {
    // Belt and braces only. The load-bearing proof is Suite A: the trigger is gone.
    assert.equal(evaluate(PREDICATE, {
      github: {
        event_name: 'deployment_status',
        repository: THIS_REPO,
        event: { deployment_status: { state: 'success' } },
      },
    }), false);
  });

  it('a workflow_run missing head_repository entirely is REJECTED, not accepted by default', () => {
    const ctx = runCtx();
    delete ctx.github.event.workflow_run.head_repository;
    assert.equal(evaluate(PREDICATE, ctx), false);
  });
});

// ── Suite C: the mirror is not vacuous ───────────────────────────────────────

describe('Suite C: positive control on the evaluator itself', () => {
  const PRE_PATCH = [
    "github.event_name == 'workflow_dispatch' ||",
    "(github.event_name == 'deployment_status' && github.event.deployment_status.state == 'success') ||",
    "(github.event_name == 'workflow_run' && github.event.workflow_run.conclusion == 'success')",
  ].join(' ');

  it('the pre-patch predicate ACCEPTS a deployment_status success — so the mirror can say yes', () => {
    assert.equal(evaluate(PRE_PATCH, {
      github: {
        event_name: 'deployment_status',
        repository: THIS_REPO,
        event: { deployment_status: { state: 'success' } },
      },
    }), true);
  });

  it('the pre-patch predicate ACCEPTS a fork workflow_run — the exact gap this patch closes', () => {
    assert.equal(evaluate(PRE_PATCH, runCtx({
      workflow_run: { head_repository: { full_name: 'attacker-fork/pro-work' }, head_branch: 'evil' },
    })), true);
  });

  it('the current predicate is not the pre-patch predicate', () => {
    assert.notEqual(PREDICATE.replace(/\s+/g, ' ').trim(), PRE_PATCH);
  });
});

// ── Suite D: credential handling ─────────────────────────────────────────────

describe('Suite D: MWA_READ_TOKEN handling', () => {
  it('the token is referenced, and only by reference — no literal is committed', () => {
    assert.match(SRC, /secrets\.MWA_READ_TOKEN/, 'the token must be referenced');
    assert.ok(!/ghp_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}/.test(SRC),
      'no token literal may appear in the workflow');
  });

  it('exactly the two central checkouts consume the token', () => {
    const consumers = SRC.split('\n').filter(l => /token:\s*\$\{\{\s*secrets\.MWA_READ_TOKEN\s*\}\}/.test(l));
    assert.equal(consumers.length, 2, 'only the runner and evidence checkouts may take the token');
  });

  it('both central checkouts set persist-credentials: false', () => {
    const blocks = stepBodies().filter(b => /token:\s*\$\{\{\s*secrets\.MWA_READ_TOKEN/.test(b));
    assert.equal(blocks.length, 2, 'expected exactly the two central checkouts to bear the token');
    for (const b of blocks) {
      assert.match(b, /persist-credentials:\s*false/,
        'a token-bearing checkout must not persist the credential into the git config');
    }
  });

  it('the product checkout does NOT take the token', () => {
    const block = stepNamed('Checkout product');
    assert.ok(block, 'product checkout step not found');
    assert.ok(!/MWA_READ_TOKEN/.test(block), 'the product checkout must use the default GITHUB_TOKEN');
  });

  it('the step extractor is sound — it isolates a step from the next step\'s comment', () => {
    // Guards the false positive that the naive "- name: " split produced: the product checkout
    // step must not absorb the credential comment that introduces the central checkout.
    const block = stepNamed('Checkout product');
    assert.ok(!block.includes('PRIVATE cross-repository read'),
      'step boundary leaked the following step\'s comment');
    assert.match(block, /uses: actions\/checkout@[0-9a-f]{40}/);
  });

  it('the token never appears inside a run: block', () => {
    const lines = SRC.split('\n');
    let inRun = false, indent = 0;
    for (const l of lines) {
      if (/^\s*-?\s*run:\s*\|/.test(l)) { inRun = true; indent = l.length - l.trimStart().length; continue; }
      if (inRun) {
        if (l.trim() !== '' && (l.length - l.trimStart().length) <= indent) { inRun = false; }
        else {
          assert.ok(!/secrets\.MWA_READ_TOKEN/.test(l),
            'the secret must never be expanded into shell source');
        }
      }
    }
  });

  it('the presence check exposes a boolean, never the value', () => {
    assert.match(SRC, /MWA_TOKEN_PRESENT:\s*\$\{\{\s*secrets\.MWA_READ_TOKEN\s*!=\s*''\s*\}\}/,
      'presence must be computed as a comparison, which yields true/false');
  });

  it('workflow permissions remain contents: read — no write authority is added', () => {
    assert.match(SRC, /^permissions:\n\s+contents:\s*read\s*$/m);
    assert.ok(!/permissions:[\s\S]{0,200}?(write|write-all)/.test(SRC),
      'no write permission may be granted');
  });
});

// ── Suite E: assurance stays non-authoritative ───────────────────────────────

describe('Suite E: assurance authority unchanged', () => {
  it('every third-party action is pinned to a 40-hex SHA', () => {
    const uses = SRC.split('\n')
      .map(l => (l.match(/uses:\s*([^\s#]+)/) || [])[1])
      .filter(Boolean);
    assert.ok(uses.length >= 4, 'expected the action set to be non-empty');
    for (const u of uses) {
      assert.match(u, /@[0-9a-f]{40}$/, `action not pinned to an immutable SHA: ${u}`);
    }
  });

  it('the header no longer claims the workflow carries no credentials at all', () => {
    assert.ok(!/never .{0,40}carr(y|ies|ying) credentials/i.test(SRC),
      'header prose must match behaviour once a credential is carried');
    assert.match(SRC, /MWA_READ_TOKEN/, 'the header must name the credential it carries');
  });

  it('the runner is still pinned by tag and the baseline by digest', () => {
    assert.match(SRC, /MWA_TAG:\s*v0\.1\.1/);
    assert.match(SRC, /baseline-check --lock assurance\/baseline\.lock/);
  });
});
