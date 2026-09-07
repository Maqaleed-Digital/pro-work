'use strict';

/**
 * CSP ⇄ frontend origin parity.
 *
 * A Content-Security-Policy is only as good as its agreement with what the app
 * actually loads. The first version of this policy shipped `font-src 'self' data:`
 * while both HTML entrypoints load IBM Plex Sans Arabic from Google Fonts — the
 * policy was strictly correct and would have silently broken the Arabic face in
 * production. Nothing caught it, because every test asserted the header's presence
 * rather than its agreement with the markup.
 *
 * These tests read the REAL served policy off a booted server and cross-check it
 * against the third-party origins the REAL HTML entrypoints reference. Adding a
 * CDN to the markup without adding it to the policy fails here.
 */

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs    = require('fs');
const http  = require('http');
const path  = require('path');
const { spawn } = require('child_process');

const ROOT   = path.join(__dirname, '..', '..');
const SERVER = path.join(ROOT, 'app', 'server.js');
const PORT   = process.env.CSP_PARITY_TEST_PORT || '3119';

const ENTRYPOINTS = ['app/frontend/index.html', 'app/frontend/app.html'];

let child;
let policy = '';

function get(pathname) {
  return new Promise((resolve, reject) => {
    const req = http.get({ host: '127.0.0.1', port: Number(PORT), path: pathname }, res => {
      res.resume();
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers }));
    });
    req.on('error', reject);
    req.setTimeout(5000, () => req.destroy(new Error('timeout')));
  });
}

before(async () => {
  child = spawn(process.execPath, [SERVER], {
    cwd: path.join(ROOT, 'app'),
    env: { ...process.env, NODE_ENV: 'test', APP_PORT: PORT, PORT, TRUSTED_PROXY: '1' },
    stdio: ['ignore', 'ignore', 'ignore'],
  });
  let last;
  for (let i = 0; i < 40; i++) {
    try { const r = await get('/api/health'); policy = r.headers['content-security-policy'] || ''; break; }
    catch (e) { last = e; await new Promise(r => setTimeout(r, 250)); }
  }
  if (!policy) throw new Error(`server never served a CSP: ${last && last.message}`);
});

after(() => { if (child) child.kill(); });

/** Parse "a 'self' x; b y" -> { a: ["'self'","x"], b: ["y"] } */
function directives() {
  const out = {};
  for (const part of policy.split(';')) {
    const toks = part.trim().split(/\s+/).filter(Boolean);
    if (toks.length) out[toks[0]] = toks.slice(1);
  }
  return out;
}

/** Third-party origins referenced by the real HTML, by how they are loaded. */
function referencedOrigins() {
  const found = { style: new Set(), font: new Set(), script: new Set(), other: new Set() };
  for (const rel of ENTRYPOINTS) {
    const file = path.join(ROOT, rel);
    if (!fs.existsSync(file)) continue;
    const html = fs.readFileSync(file, 'utf8');

    for (const m of html.matchAll(/<link\b[^>]*>/gi)) {
      const tag = m[0];
      const href = (tag.match(/href="([^"]+)"/i) || [])[1];
      if (!href || !/^https?:\/\//i.test(href)) continue;
      const origin = new URL(href).origin;
      const rel2 = (tag.match(/rel="([^"]+)"/i) || [])[1] || '';
      if (/stylesheet/i.test(rel2)) found.style.add(origin);
      else if (/preconnect|dns-prefetch/i.test(rel2)) found.other.add(origin);
      else found.other.add(origin);
    }
    for (const m of html.matchAll(/<script\b[^>]*\bsrc="(https?:\/\/[^"]+)"/gi)) {
      found.script.add(new URL(m[1]).origin);
    }
  }
  // A Google Fonts stylesheet always pulls its font files from fonts.gstatic.com.
  if (found.style.has('https://fonts.googleapis.com')) found.font.add('https://fonts.gstatic.com');
  return found;
}

function allows(directive, origin) {
  const d = directives();
  const list = d[directive] || d['default-src'] || [];
  return list.includes(origin) || list.includes('*');
}

describe('Suite 1: the server really serves a parseable CSP', () => {
  it('CSP header is present on the live path', () => {
    assert.ok(policy.length > 0, 'no Content-Security-Policy served');
  });

  it('CSP parses into named directives', () => {
    const d = directives();
    for (const req of ['default-src', 'script-src', 'style-src', 'font-src', 'connect-src']) {
      assert.ok(d[req], `missing directive: ${req}`);
    }
  });

  it('the entrypoints under test actually exist (parity check is not vacuous)', () => {
    const present = ENTRYPOINTS.filter(f => fs.existsSync(path.join(ROOT, f)));
    assert.ok(present.length > 0, 'no HTML entrypoint found — nothing would be compared');
  });
});

describe('Suite 2: every third-party origin the HTML loads is allowed by the policy', () => {
  it('finds the third-party origins actually referenced (non-empty)', () => {
    const o = referencedOrigins();
    const total = o.style.size + o.font.size + o.script.size;
    assert.ok(total > 0,
      'no third-party origins found — if the frontend really has none, delete this suite rather than let it pass silently');
  });

  it('stylesheet origins are permitted by style-src', () => {
    for (const origin of referencedOrigins().style) {
      assert.ok(allows('style-src', origin),
        `HTML loads a stylesheet from ${origin} but style-src does not allow it. Policy: ${policy}`);
    }
  });

  it('font origins are permitted by font-src', () => {
    for (const origin of referencedOrigins().font) {
      assert.ok(allows('font-src', origin),
        `HTML pulls fonts from ${origin} but font-src does not allow it. Policy: ${policy}`);
    }
  });

  it('external script origins are permitted by script-src', () => {
    for (const origin of referencedOrigins().script) {
      assert.ok(allows('script-src', origin),
        `HTML loads a script from ${origin} but script-src does not allow it. Policy: ${policy}`);
    }
  });
});

describe('Suite 3: the policy stays as tight as the codebase allows', () => {
  it("script-src does NOT carry 'unsafe-inline' — the entrypoints have no inline script", () => {
    const inline = [];
    for (const rel of ENTRYPOINTS) {
      const file = path.join(ROOT, rel);
      if (!fs.existsSync(file)) continue;
      const html = fs.readFileSync(file, 'utf8');
      for (const m of html.matchAll(/<script([^>]*)>([\s\S]*?)<\/script>/gi)) {
        if (!/\bsrc=/i.test(m[1]) && m[2].trim()) inline.push(rel);
      }
    }
    assert.deepEqual(inline, [],
      `inline <script> found in ${inline.join(', ')} — either remove it or this assertion must change`);
    assert.ok(!(directives()['script-src'] || []).includes("'unsafe-inline'"),
      "script-src must not carry 'unsafe-inline' while no inline script exists");
  });

  it("script-src does not carry 'unsafe-eval' and the source has no eval/new Function", () => {
    assert.ok(!(directives()['script-src'] || []).includes("'unsafe-eval'"));
    const srcDir = path.join(ROOT, 'app/frontend/src');
    const offenders = [];
    (function walk(d) {
      if (!fs.existsSync(d)) return;
      for (const e of fs.readdirSync(d, { withFileTypes: true })) {
        const f = path.join(d, e.name);
        if (e.isDirectory()) { walk(f); continue; }
        if (!/\.(js|mjs)$/.test(e.name)) continue;
        if (/__tests__/.test(f)) continue;
        const t = fs.readFileSync(f, 'utf8');
        if (/\beval\s*\(|new\s+Function\s*\(/.test(t)) offenders.push(path.relative(ROOT, f));
      }
    })(srcDir);
    assert.deepEqual(offenders, [], `eval/new Function found in: ${offenders.join(', ')}`);
  });

  it('object-src, base-uri, form-action and frame-ancestors stay locked down', () => {
    const d = directives();
    assert.deepEqual(d['object-src'],      ["'none'"]);
    assert.deepEqual(d['base-uri'],        ["'self'"]);
    assert.deepEqual(d['form-action'],     ["'self'"]);
    assert.deepEqual(d['frame-ancestors'], ["'none'"]);
  });

  it("connect-src stays 'self' while no browser-side third-party call exists", () => {
    assert.deepEqual(directives()['connect-src'], ["'self'"],
      'if a browser-side third-party API call is added, widen connect-src in the same change');
  });

  it("style-src keeps 'unsafe-inline' only while innerHTML style= attributes exist", () => {
    // Documents WHY the weakening is present, so removing those attributes is
    // recognised as the trigger to tighten the policy.
    const srcDir = path.join(ROOT, 'app/frontend/src');
    let withStyleAttr = 0;
    (function walk(d) {
      if (!fs.existsSync(d)) return;
      for (const e of fs.readdirSync(d, { withFileTypes: true })) {
        const f = path.join(d, e.name);
        if (e.isDirectory()) { walk(f); continue; }
        if (!/\.(js|mjs)$/.test(e.name)) continue;
        const t = fs.readFileSync(f, 'utf8');
        if (/innerHTML[\s\S]{0,200}?style="/.test(t)) withStyleAttr++;
      }
    })(srcDir);

    const hasUnsafeInline = (directives()['style-src'] || []).includes("'unsafe-inline'");
    if (withStyleAttr > 0) {
      assert.ok(hasUnsafeInline,
        `${withStyleAttr} file(s) build markup with inline style attributes; style-src needs 'unsafe-inline'`);
    } else {
      assert.ok(!hasUnsafeInline,
        "no innerHTML style attributes remain — tighten style-src by dropping 'unsafe-inline'");
    }
  });
});
