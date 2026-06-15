'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { loadRuntimeConfig, validateRuntimeConfig } = require('../../app/config/runtime_config');
const evidenceStore = require('../../app/storage/evidence_store');
const db = require('../../app/storage/db');

test('runtime config loads defaults', () => {
  const config = loadRuntimeConfig({});
  assert.equal(config.node_env, 'development');
  assert.equal(config.port, 3000);
});

test('runtime config validates with database disabled', () => {
  const config = loadRuntimeConfig({
    EVIDENCE_ROOT: '/tmp/prowork-evidence',
    REQUIRE_DATABASE: 'false'
  });
  assert.equal(validateRuntimeConfig(config), true);
});

test('db connect returns not configured without database url', () => {
  const result = db.connect();
  assert.equal(result.connected, false);
});

test('evidence store writes pack to configured root', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'prowork-evidence-'));
  process.env.EVIDENCE_ROOT = root;

  const result = evidenceStore.writePack('EP-TEST-01', { ok: true });

  assert.equal(result.ok, true);
  assert.equal(fs.existsSync(result.path), true);

  delete process.env.EVIDENCE_ROOT;
});
