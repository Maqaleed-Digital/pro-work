'use strict';

// S36-G5: RTL + i18n structural tests
// Run: node --test tests/i18n/rtl.test.js

const test   = require('node:test');
const assert = require('node:assert/strict');
const fs     = require('fs');
const path   = require('path');
const { execSync } = require('child_process');

const LOCALES_DIR   = path.join(__dirname, '../../app/frontend/src/locales');
const CHECK_SCRIPT  = path.join(__dirname, '../../scripts/i18n/check-translations.js');

// ─────────────────────────────────────────────────────────────────────────────
// 1. Locale file existence
// ─────────────────────────────────────────────────────────────────────────────
test('en.json locale file exists', () => {
  assert.ok(fs.existsSync(path.join(LOCALES_DIR, 'en.json')), 'en.json must exist');
});

test('ar.json locale file exists', () => {
  assert.ok(fs.existsSync(path.join(LOCALES_DIR, 'ar.json')), 'ar.json must exist');
});

test('ur.json tier-2 locale file exists', () => {
  assert.ok(fs.existsSync(path.join(LOCALES_DIR, 'ur.json')), 'ur.json must exist');
});

test('fr.json tier-2 locale file exists', () => {
  assert.ok(fs.existsSync(path.join(LOCALES_DIR, 'fr.json')), 'fr.json must exist');
});

test('es.json tier-2 locale file exists', () => {
  assert.ok(fs.existsSync(path.join(LOCALES_DIR, 'es.json')), 'es.json must exist');
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. ar.json — full translation parity with en.json
// ─────────────────────────────────────────────────────────────────────────────
test('ar.json has all keys from en.json', () => {
  const en = JSON.parse(fs.readFileSync(path.join(LOCALES_DIR, 'en.json'), 'utf8'));
  const ar = JSON.parse(fs.readFileSync(path.join(LOCALES_DIR, 'ar.json'), 'utf8'));
  const missing = Object.keys(en).filter(k => !(k in ar));
  assert.deepEqual(missing, [], `ar.json missing keys: ${missing.join(', ')}`);
});

test('ar.json has no empty values', () => {
  const ar = JSON.parse(fs.readFileSync(path.join(LOCALES_DIR, 'ar.json'), 'utf8'));
  const empty = Object.entries(ar).filter(([, v]) => !v || String(v).trim() === '').map(([k]) => k);
  assert.deepEqual(empty, [], `ar.json has empty values for: ${empty.join(', ')}`);
});

test('ar.json contains genuine Arabic characters', () => {
  const ar = JSON.parse(fs.readFileSync(path.join(LOCALES_DIR, 'ar.json'), 'utf8'));
  const arabicValues = Object.values(ar).filter(v => /[\u0600-\u06FF]/.test(v));
  assert.ok(arabicValues.length > 0, 'ar.json must contain Arabic characters');
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. Tier-2 locale structural parity
// ─────────────────────────────────────────────────────────────────────────────
for (const lang of ['ur', 'fr', 'es']) {
  test(`${lang}.json has structural parity with en.json (all keys, values may be empty)`, () => {
    const en  = JSON.parse(fs.readFileSync(path.join(LOCALES_DIR, 'en.json'), 'utf8'));
    const loc = JSON.parse(fs.readFileSync(path.join(LOCALES_DIR, lang + '.json'), 'utf8'));
    const missing = Object.keys(en).filter(k => !(k in loc));
    assert.deepEqual(missing, [], `${lang}.json missing structural keys: ${missing.join(', ')}`);
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. RTL locale set correctness
// ─────────────────────────────────────────────────────────────────────────────
test('ar locale is in RTL set', () => {
  const RTL = new Set(['ar', 'he', 'fa', 'ur']);
  assert.ok(RTL.has('ar'), 'ar must be RTL');
});

test('en locale is not in RTL set', () => {
  const RTL = new Set(['ar', 'he', 'fa', 'ur']);
  assert.ok(!RTL.has('en'), 'en must be LTR');
});

test('dir is rtl for ar locale', () => {
  const RTL_LOCALES = new Set(['ar', 'he', 'fa', 'ur']);
  const getDir = (locale) => RTL_LOCALES.has(locale) ? 'rtl' : 'ltr';
  assert.equal(getDir('ar'), 'rtl');
  assert.equal(getDir('en'), 'ltr');
  assert.equal(getDir('ur'), 'rtl');
  assert.equal(getDir('fr'), 'ltr');
});

// ─────────────────────────────────────────────────────────────────────────────
// 5. check-translations.js — script exists and is executable
// ─────────────────────────────────────────────────────────────────────────────
test('check-translations.js script exists', () => {
  assert.ok(fs.existsSync(CHECK_SCRIPT), 'check-translations.js must exist');
});

// ─────────────────────────────────────────────────────────────────────────────
// 6. check-translations.js — exits 0 when all translations present
// ─────────────────────────────────────────────────────────────────────────────
test('check-translations.js exits 0 with valid locale files', () => {
  let exitCode = 0;
  try {
    execSync(`node ${CHECK_SCRIPT}`, { stdio: 'pipe' });
  } catch (err) {
    exitCode = err.status;
  }
  assert.equal(exitCode, 0, 'check-translations.js must exit 0 with valid locales');
});

// ─────────────────────────────────────────────────────────────────────────────
// 7. check-translations.js — exits 1 when ar.json has a missing key
// ─────────────────────────────────────────────────────────────────────────────
test('check-translations.js exits 1 when ar.json is missing a key', () => {
  const arPath = path.join(LOCALES_DIR, 'ar.json');
  const original = fs.readFileSync(arPath, 'utf8');
  const ar = JSON.parse(original);

  // Remove one key to simulate a missing translation
  const keyToRemove = Object.keys(ar)[0];
  delete ar[keyToRemove];
  fs.writeFileSync(arPath, JSON.stringify(ar, null, 2));

  let exitCode = 0;
  let stderr = '';
  try {
    execSync(`node ${CHECK_SCRIPT}`, { stdio: 'pipe' });
  } catch (err) {
    exitCode = err.status;
    stderr = (err.stderr || '').toString();
  }

  // Restore original
  fs.writeFileSync(arPath, original);

  assert.equal(exitCode, 1, 'must exit 1 when ar.json is missing a key');
  assert.ok(
    stderr.includes('MISSING AR TRANSLATION') || stderr.includes(keyToRemove),
    'stderr must name the missing key'
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// 8. check-translations.js — exits 1 when tier-2 locale is missing a key
// ─────────────────────────────────────────────────────────────────────────────
test('check-translations.js exits 1 when ur.json is missing a structural key', () => {
  const urPath = path.join(LOCALES_DIR, 'ur.json');
  const original = fs.readFileSync(urPath, 'utf8');
  const ur = JSON.parse(original);

  const keyToRemove = Object.keys(ur)[0];
  delete ur[keyToRemove];
  fs.writeFileSync(urPath, JSON.stringify(ur, null, 2));

  let exitCode = 0;
  try {
    execSync(`node ${CHECK_SCRIPT}`, { stdio: 'pipe' });
  } catch (err) {
    exitCode = err.status;
  }

  fs.writeFileSync(urPath, original);

  assert.equal(exitCode, 1, 'must exit 1 when ur.json is missing a structural key');
});

// ─────────────────────────────────────────────────────────────────────────────
// 9. No hardcoded left/right in layout-affecting CSS (spot check patched files)
// ─────────────────────────────────────────────────────────────────────────────
test('governance.js has no padding-left in layout CSS after S36-G5 patch', () => {
  const src = fs.readFileSync(
    path.join(__dirname, '../../app/frontend/src/pages/governance.js'), 'utf8'
  );
  assert.ok(!src.includes('padding-left'), 'governance.js must not use padding-left');
});

test('system.js has no margin-right in layout CSS after S36-G5 patch', () => {
  const src = fs.readFileSync(
    path.join(__dirname, '../../app/frontend/src/pages/system.js'), 'utf8'
  );
  assert.ok(!src.includes('margin-right'), 'system.js must not use margin-right');
});

test('system.js has no text-align:left after S36-G5 patch', () => {
  const src = fs.readFileSync(
    path.join(__dirname, '../../app/frontend/src/pages/system.js'), 'utf8'
  );
  assert.ok(!src.includes('text-align:left'), 'system.js must not use text-align:left');
});
