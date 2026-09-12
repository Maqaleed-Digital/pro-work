'use strict';

/**
 * WC-012 — code <-> runtime environment contract.
 *
 * Two halves, and both are needed:
 *
 *  1. CONTRACT CONTROLS — the checker must refuse a task definition whose environment does
 *     not satisfy what the shipped code requires. Each control perturbs a real fixture and
 *     asserts the perturbation actually took effect before believing the checker's verdict.
 *
 *  2. THE DEPENDENCY ITSELF — a live-server proof that HSTS emission genuinely depends on
 *     TRUSTED_PROXY. Without this, the contract is an assertion about an assertion: it would
 *     declare TRUSTED_PROXY behaviour-gating on the strength of a code reading. Here the
 *     server is booted both ways and the header is observed.
 *
 * This is the defect class that produced workcaptain:18 shipping correct HSTS code to a
 * production surface that emitted no HSTS header.
 */

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http   = require('http');
const path   = require('path');
const fs     = require('fs');
const { spawn } = require('child_process');

const { loadContract, check, DEFAULT_CONTRACT } =
  require('../../scripts/security/env_contract_check.js');

const ROOT     = path.join(__dirname, '..', '..');
const FIXTURE  = path.join(ROOT, 'tests', 'release', 'fixtures', 'live-taskdef-17.json');
const CONTAINER = 'workcaptain';
const contract = loadContract(DEFAULT_CONTRACT);

const base = () => JSON.parse(fs.readFileSync(FIXTURE, 'utf8'));
const container = (td) => (td.taskDefinition || td).containerDefinitions.find(c => c.name === CONTAINER);

/** A fixture that DOES satisfy the contract: the live one plus the missing TRUSTED_PROXY. */
function compliant() {
  const td = base();
  container(td).environment.push({ name: 'TRUSTED_PROXY', value: '1' });
  return td;
}

describe('WC-012 contract controls', () => {
  it('the shipped fixture is the real live task definition', () => {
    const td = base().taskDefinition;
    assert.equal(td.family, 'workcaptain');
    assert.deepEqual(
      container(base()).secrets.map(s => s.name).sort(),
      ['ADMIN_API_TOKEN', 'DATABASE_URL', 'JWT_SECRET']
    );
  });

  it('NC-ENV-08 — a contract-compliant task definition PASSES', () => {
    const r = check(contract, compliant(), CONTAINER);
    assert.equal(r.pass, true, `expected PASS, got: ${JSON.stringify(r.findings)}`);
    assert.ok(r.checked > 0, 'a checker that evaluated nothing must never report clean');
    assert.ok(r.checked >= 10, `only ${r.checked} variables evaluated`);
  });

  it('the UNMODIFIED live fixture FAILS — this is the real defect, not a synthetic one', () => {
    // The live task definition genuinely lacks TRUSTED_PROXY. If this ever passes, the
    // contract has been weakened rather than the runtime fixed.
    const r = check(contract, base(), CONTAINER);
    assert.equal(r.pass, false);
    assert.ok(r.findings.some(f => /TRUSTED_PROXY is MISSING/.test(f)), JSON.stringify(r.findings));
  });

  it('NC-ENV-01 — TRUSTED_PROXY removed: FAIL', () => {
    const td = compliant();
    const before = container(td).environment.length;
    container(td).environment = container(td).environment.filter(e => e.name !== 'TRUSTED_PROXY');
    assert.equal(container(td).environment.length, before - 1, 'perturbation did not take effect');
    const r = check(contract, td, CONTAINER);
    assert.equal(r.pass, false);
    assert.ok(r.findings.some(f => /TRUSTED_PROXY is MISSING/.test(f)), JSON.stringify(r.findings));
  });

  it('NC-ENV-02 — TRUSTED_PROXY set to a non-accepted value: FAIL', () => {
    for (const bad of ['0', 'false', 'yes', '', 'TRUE']) {
      const td = compliant();
      container(td).environment.find(e => e.name === 'TRUSTED_PROXY').value = bad;
      assert.equal(container(td).environment.find(e => e.name === 'TRUSTED_PROXY').value, bad);
      const r = check(contract, td, CONTAINER);
      assert.equal(r.pass, false, `value "${bad}" was wrongly accepted`);
    }
    // 'TRUE' matters: app/server.js compares === "true", so casing is load-bearing.
  });

  it('NC-ENV-03 — TRUSTED_PROXY renamed: FAIL, as missing AND as undeclared', () => {
    const td = compliant();
    container(td).environment.find(e => e.name === 'TRUSTED_PROXY').name = 'TRUST_PROXY';
    const r = check(contract, td, CONTAINER);
    assert.equal(r.pass, false);
    assert.ok(r.findings.some(f => /TRUSTED_PROXY is MISSING/.test(f)), 'missing not reported');
    assert.ok(r.findings.some(f => /UNDECLARED environment variable in runtime: TRUST_PROXY/.test(f)),
      'the typo was not surfaced as an orphan');
  });

  it('NC-ENV-04 — JWT_SECRET dropped from secrets: FAIL, by name', () => {
    const td = compliant();
    container(td).secrets = container(td).secrets.filter(s => s.name !== 'JWT_SECRET');
    assert.equal(container(td).secrets.length, 2, 'perturbation did not take effect');
    const r = check(contract, td, CONTAINER);
    assert.equal(r.pass, false);
    assert.ok(r.findings.some(f => /REQUIRED secret JWT_SECRET is ABSENT/.test(f)), JSON.stringify(r.findings));
  });

  it('NC-ENV-05 — JWT_SECRET moved to plaintext environment: FAIL', () => {
    const td = compliant();
    container(td).secrets = container(td).secrets.filter(s => s.name !== 'JWT_SECRET');
    container(td).environment.push({ name: 'JWT_SECRET', value: 'not-a-real-value' });
    const r = check(contract, td, CONTAINER);
    assert.equal(r.pass, false);
    assert.ok(r.findings.some(f => /SECRET JWT_SECRET appears as PLAINTEXT environment/.test(f)),
      JSON.stringify(r.findings));
  });

  it('NC-ENV-06 — another required runtime variable dropped: FAIL', () => {
    for (const name of ['NODE_ENV', 'PROWORK_DATA_DIR', 'APP_PORT', 'CORS_ALLOWED_ORIGINS']) {
      const td = compliant();
      container(td).environment = container(td).environment.filter(e => e.name !== name);
      const r = check(contract, td, CONTAINER);
      assert.equal(r.pass, false, `${name} could go missing without a finding`);
      assert.ok(r.findings.some(f => f.includes(name)), `finding did not name ${name}`);
    }
  });

  it('NC-ENV-07 — an OPTIONAL variable absent: PASS', () => {
    const td = compliant();
    container(td).environment = container(td).environment.filter(e => e.name !== 'PUBLIC_BASE_URL');
    const r = check(contract, td, CONTAINER);
    assert.equal(r.pass, true, `optional absence must be allowed: ${JSON.stringify(r.findings)}`);
  });

  it('duplicate environment entries are refused', () => {
    const td = compliant();
    container(td).environment.push({ name: 'NODE_ENV', value: 'production' });
    const r = check(contract, td, CONTAINER);
    assert.equal(r.pass, false);
    assert.ok(r.findings.some(f => /DUPLICATE environment entry/.test(f)));
  });

  it('a malformed task definition FAILS rather than passing with nothing checked', () => {
    for (const bad of [null, {}, { taskDefinition: {} }, { containerDefinitions: [] }]) {
      const r = check(contract, bad, CONTAINER);
      assert.equal(r.pass, false, `accepted malformed input: ${JSON.stringify(bad)}`);
      assert.equal(r.checked, 0);
    }
  });

  it('a missing container FAILS', () => {
    const r = check(contract, compliant(), 'not-a-container');
    assert.equal(r.pass, false);
    assert.ok(r.findings.some(f => /not present in task definition/.test(f)));
  });
});

// ── The dependency itself, observed rather than asserted ─────────────────────

const SERVER = path.join(ROOT, 'app', 'server.js');

function get(port, pathname, headers) {
  return new Promise((resolve, reject) => {
    const req = http.get({ host: '127.0.0.1', port, path: pathname, headers: headers || {} }, res => {
      res.resume();
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers }));
    });
    req.on('error', reject);
    req.setTimeout(5000, () => req.destroy(new Error('request timed out')));
  });
}

async function boot(port, extraEnv) {
  const child = spawn(process.execPath, [SERVER], {
    cwd: path.join(ROOT, 'app'),
    env: { ...process.env, NODE_ENV: 'test', APP_PORT: String(port), PORT: String(port), ...extraEnv },
    stdio: ['ignore', 'ignore', 'ignore'],
  });
  for (let i = 0; i < 40; i++) {
    try { await get(port, '/api/health'); return child; } catch { await new Promise(r => setTimeout(r, 250)); }
  }
  child.kill();
  throw new Error(`server on ${port} did not become ready`);
}

describe('WC-012 — HSTS genuinely depends on TRUSTED_PROXY', () => {
  let withProxy, withoutProxy;
  const P_WITH = Number(process.env.WC012_PORT_WITH || 3131);
  const P_WITHOUT = Number(process.env.WC012_PORT_WITHOUT || 3132);

  before(async () => {
    // TRUSTED_PROXY is deleted, not set empty — absence is the production condition.
    const noProxyEnv = { TRUSTED_PROXY: undefined };
    withProxy = await boot(P_WITH, { TRUSTED_PROXY: '1' });
    withoutProxy = await boot(P_WITHOUT, noProxyEnv);
  });

  after(() => { if (withProxy) withProxy.kill(); if (withoutProxy) withoutProxy.kill(); });

  it('TRUSTED_PROXY=1 + x-forwarded-proto: https => HSTS PRESENT', async () => {
    const res = await get(P_WITH, '/api/health', { 'x-forwarded-proto': 'https' });
    assert.equal(res.status, 200);
    assert.ok(res.headers['strict-transport-security'],
      'HSTS must be emitted when the proxy is trusted');
    assert.match(res.headers['strict-transport-security'], /max-age=\d+/);
  });

  it('TRUSTED_PROXY absent + x-forwarded-proto: https => HSTS ABSENT (the production defect)', async () => {
    const res = await get(P_WITHOUT, '/api/health', { 'x-forwarded-proto': 'https' });
    assert.equal(res.status, 200);
    assert.equal(res.headers['strict-transport-security'], undefined,
      'without TRUSTED_PROXY the forwarded proto must NOT be trusted — this reproduces workcaptain:18');
  });

  it('CSP is emitted in BOTH configurations — it does not depend on TRUSTED_PROXY', async () => {
    // This is why CSP shipped and HSTS did not. Asserting it stops a future change from
    // quietly coupling CSP to the same gate.
    for (const port of [P_WITH, P_WITHOUT]) {
      const res = await get(port, '/api/health', { 'x-forwarded-proto': 'https' });
      assert.ok(res.headers['content-security-policy'], `CSP missing on port ${port}`);
    }
  });
});
