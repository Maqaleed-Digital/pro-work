'use strict';

/**
 * Web Assurance trust boundary — MAQ-WAAP-001 H3.
 *
 * The product repository is PUBLIC; the central assurance repository
 * (Waheebow/maqaleed-web-assurance) is PRIVATE and under a different owner, so the
 * repository-scoped GITHUB_TOKEN cannot read it. web-assurance.yml therefore acquires one
 * narrowly scoped read-only credential: since D2, a SHORT-LIVED GitHub App installation token
 * minted after the trust predicate has admitted the run. This suite proves WHO CAN REACH IT.
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

describe('Suite B: job predicate — who can reach the credential fabric', () => {
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

/**
 * D2 (MAQ-WAAP-001). The credential model changed and this suite changed with it, in the
 * strengthening direction only. The workflow no longer holds a stored repository PAT at all: it
 * mints a SHORT-LIVED GitHub App installation token, scoped to the central assurance repository
 * with Contents: Read, and only AFTER the job predicate (Suites A–C) has already admitted the run.
 *
 * Two properties the PAT model could not express are now asserted here:
 *   MINT_AFTER_TRUST        — nothing can acquire a credential before the trust boundary; the mint
 *                             step must precede every credential-consuming step.
 *   NO_REPOSITORY_PAT       — MWA_READ_TOKEN must not appear on this path at all. It stays
 *                             CONFIGURED on the repository as the rollback, but the active path
 *                             must not reference it; a reintroduction fails here.
 */
describe('Suite D: GitHub App credential handling', () => {
  /** Index of a step within stepBodies(), by a substring of its `- name:` line. */
  const stepIndex = (prefix) => stepBodies().findIndex(b => b.includes(`- name: ${prefix}`));

  it('no repository PAT is referenced on the active path — the PAT is rollback, not credential', () => {
    assert.ok(!/MWA_READ_TOKEN/.test(SRC),
      'the migrated path must not reference MWA_READ_TOKEN; it remains configured only as the rollback');
  });

  it('key material is referenced only by name — no literal is committed', () => {
    assert.match(SRC, /secrets\.MWA_APP_PRIVATE_KEY/, 'the App private key must be referenced');
    assert.match(SRC, /vars\.MWA_APP_ID/, 'the App id must be read from an Actions variable');
    assert.ok(!/ghp_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}/.test(SRC),
      'no token literal may appear in the workflow');
    assert.ok(!/-----BEGIN[^\n]*KEY-----/.test(SRC),
      'no private key material may appear in the workflow');
  });

  it('exactly one mint step exists, scoped to the central repository with Contents: Read', () => {
    const mints = stepBodies().filter(b => /uses:\s*actions\/create-github-app-token@[0-9a-f]{40}/.test(b));
    assert.equal(mints.length, 1, 'exactly one credential may ever be minted');
    const m = mints[0];
    assert.match(m, /owner:\s*Waheebow/, 'the mint must name the central owner');
    assert.match(m, /repositories:\s*maqaleed-web-assurance\s*$/m,
      'the minted token must cover the central assurance repository and nothing else');
    assert.match(m, /permission-contents:\s*read/, 'the minted token must grant Contents: Read');
    assert.ok(!/permission-(?!contents)/.test(m), 'no permission beyond contents may be requested');
  });

  it('MINT_AFTER_TRUST — the mint precedes every credential-consuming step', () => {
    const mintAt = stepIndex('Mint central read token');
    assert.ok(mintAt >= 0, 'mint step not found');
    const consumers = stepBodies()
      .map((b, i) => ({ b, i }))
      .filter(({ b }) => /token:\s*\$\{\{\s*steps\.mwa_token\.outputs\.token\s*\}\}/.test(b));
    assert.equal(consumers.length, 2, 'only the runner and evidence checkouts may take the token');
    for (const { i } of consumers) {
      assert.ok(mintAt < i, `credential consumed at step ${i} before the mint at ${mintAt}`);
    }
    // The trust boundary itself is the job predicate proven in Suites A–C: a rejected event never
    // starts the job, so the mint step is unreachable and REJECTED_EVENT_MINT_COUNT is 0.
    assert.ok(PREDICATE.includes("github.event_name == 'workflow_run'"),
      'the job predicate must still gate the automatic path');
  });

  it('exactly the two central checkouts consume the minted token', () => {
    const consumers = SRC.split('\n')
      .filter(l => /token:\s*\$\{\{\s*steps\.mwa_token\.outputs\.token\s*\}\}/.test(l));
    assert.equal(consumers.length, 2, 'only the runner and evidence checkouts may take the token');
  });

  it('both central checkouts set persist-credentials: false', () => {
    const blocks = stepBodies().filter(b => /token:\s*\$\{\{\s*steps\.mwa_token\.outputs\.token/.test(b));
    assert.equal(blocks.length, 2, 'expected exactly the two central checkouts to bear the token');
    for (const b of blocks) {
      assert.match(b, /persist-credentials:\s*false/,
        'a token-bearing checkout must not persist the credential into the git config');
    }
  });

  it('the product checkout takes no credential at all', () => {
    const block = stepNamed('Checkout product');
    assert.ok(block, 'product checkout step not found');
    assert.ok(!/token:/.test(block), 'the product checkout must use the default GITHUB_TOKEN');
    assert.match(block, /persist-credentials:\s*false/);
  });

  it('the step extractor is sound — it isolates a step from the next step\'s comment', () => {
    // Guards the false positive that the naive "- name: " split produced: the product checkout
    // step must not absorb the comment that introduces the following presence-check step.
    const block = stepNamed('Checkout product');
    assert.ok(!block.includes('Boolean presence only'),
      'step boundary leaked the following step\'s comment');
    assert.match(block, /uses: actions\/checkout@[0-9a-f]{40}/);
  });

  it('neither the key nor the minted token ever appears inside a run: block', () => {
    const lines = SRC.split('\n');
    let inRun = false, indent = 0;
    for (const l of lines) {
      if (/^\s*-?\s*run:\s*\|/.test(l)) { inRun = true; indent = l.length - l.trimStart().length; continue; }
      if (inRun) {
        if (l.trim() !== '' && (l.length - l.trimStart().length) <= indent) { inRun = false; }
        else {
          assert.ok(!/secrets\.MWA_APP_PRIVATE_KEY/.test(l),
            'the private key must never be expanded into shell source');
          assert.ok(!/steps\.mwa_token\.outputs\.token/.test(l),
            'the minted token must never be expanded into shell source');
        }
      }
    }
  });

  it('the presence check exposes a boolean, never either value', () => {
    assert.match(SRC, /MWA_APP_PRESENT:\s*\$\{\{\s*vars\.MWA_APP_ID\s*!=\s*''\s*&&\s*secrets\.MWA_APP_PRIVATE_KEY\s*!=\s*''\s*\}\}/,
      'presence must be computed as comparisons, which yield true/false');
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

  it('the header names the credential model it actually carries', () => {
    assert.ok(!/never .{0,40}carr(y|ies|ying) credentials/i.test(SRC),
      'header prose must match behaviour once a credential is carried');
    assert.match(SRC, /GITHUB_APP_INSTALLATION_TOKEN/,
      'the header must name the credential model it carries');
    assert.match(SRC, /No repository PAT/,
      'the header must state that no repository PAT is on this path');
  });

  it('the runner is still pinned by tag and the baseline by digest', () => {
    assert.match(SRC, /MWA_RUNNER_REF:\s*[0-9a-f]{40} # v\d+\.\d+\.\d+/,
      'the runner must be pinned to the immutable commit of a released tag');
    assert.match(SRC, /baseline-check --lock assurance\/baseline\.lock/);
  });
});
