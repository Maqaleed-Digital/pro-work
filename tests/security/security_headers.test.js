'use strict';

/**
 * Response security headers — asserted against the LIVE server surface.
 *
 * Why HTTP-level and not a unit test on a header map: app/lib/security/
 * security_middleware.js declares a complete header set (HSTS, CSP and all) and
 * is required by nothing. A test asserting that module passed for months while
 * the served responses carried neither header. These tests boot the real server
 * and read real response headers, so they can only pass if the deployed surface
 * actually emits them.
 */

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http   = require('http');
const path   = require('path');
const { spawn } = require('child_process');

const ROOT       = path.join(__dirname, '..', '..');
const SERVER     = path.join(ROOT, 'app', 'server.js');
const PORT       = process.env.SECHDR_TEST_PORT || '3117';
const BASE       = `http://127.0.0.1:${PORT}`;

let child;

function get(pathname, headers) {
  return new Promise((resolve, reject) => {
    const req = http.get(
      { host: '127.0.0.1', port: Number(PORT), path: pathname, headers: headers || {} },
      res => {
        res.resume();
        res.on('end', () => resolve({ status: res.statusCode, headers: res.headers }));
      },
    );
    req.on('error', reject);
    req.setTimeout(5000, () => req.destroy(new Error('request timed out')));
  });
}

async function waitForReady(attempts = 40) {
  let lastErr;
  for (let i = 0; i < attempts; i++) {
    try { return await get('/api/health'); } catch (e) { lastErr = e; }
    await new Promise(r => setTimeout(r, 250));
  }
  throw new Error(`server did not become ready: ${lastErr && lastErr.message}`);
}

before(async () => {
  child = spawn(process.execPath, [SERVER], {
    cwd: path.join(ROOT, 'app'),
    env: { ...process.env, NODE_ENV: 'test', APP_PORT: PORT, PORT, TRUSTED_PROXY: '1' },
    stdio: ['ignore', 'ignore', 'ignore'],
  });
  await waitForReady();
});

after(() => { if (child) child.kill(); });

describe('response security headers — live server surface', () => {
  it('server answers on the health probe (the surface under test is really up)', async () => {
    const res = await get('/api/health');
    assert.equal(res.status, 200);
  });

  it('emits X-Content-Type-Options: nosniff', async () => {
    const res = await get('/api/health');
    assert.equal(res.headers['x-content-type-options'], 'nosniff');
  });

  it('emits X-Frame-Options: DENY', async () => {
    const res = await get('/api/health');
    assert.equal(res.headers['x-frame-options'], 'DENY');
  });

  it('emits Referrer-Policy', async () => {
    const res = await get('/api/health');
    assert.ok(res.headers['referrer-policy'], 'Referrer-Policy must be set');
  });

  it('emits Permissions-Policy', async () => {
    const res = await get('/api/health');
    assert.ok(res.headers['permissions-policy'], 'Permissions-Policy must be set');
  });

  it('emits Content-Security-Policy on the live path', async () => {
    const res = await get('/api/health');
    const csp = res.headers['content-security-policy'];
    assert.ok(csp, 'CSP must be served (it was declared only in an unreferenced module before)');
    assert.match(csp, /default-src 'self'/);
    assert.match(csp, /frame-ancestors 'none'/);
    assert.match(csp, /object-src 'none'/);
  });

  it('emits HSTS when the proxy reports an HTTPS request', async () => {
    const res = await get('/api/health', { 'x-forwarded-proto': 'https' });
    const hsts = res.headers['strict-transport-security'];
    assert.ok(hsts, 'HSTS must be served for TLS-terminated requests');
    assert.match(hsts, /max-age=31536000/);
    assert.match(hsts, /includeSubDomains/);
  });

  it('omits HSTS on a plaintext request (asserting it there is a no-op)', async () => {
    const res = await get('/api/health');
    assert.equal(res.headers['strict-transport-security'], undefined,
      'HSTS must not be claimed on a non-TLS origin');
  });

  it('security headers are present on a 404 too, not only on happy paths', async () => {
    const res = await get('/definitely-not-a-route-' + Date.now());
    assert.equal(res.headers['x-content-type-options'], 'nosniff');
    assert.ok(res.headers['content-security-policy'], 'CSP must survive the error path');
  });
});
