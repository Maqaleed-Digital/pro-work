#!/usr/bin/env node
'use strict';

// S36-G5: Translation key parity checker
// BRD Refs: Gold BRD A6, Consolidated §5.2
//
// HARD BUILD GATE — exits 1 if:
//   1. Any key in en.json is missing from ar.json
//   2. Any t('key') or t("key") call in source uses a key not in en.json
//   3. Tier-2 locales (ur, fr, es) are missing any key from en.json
//      (values may be empty — structure must be complete)
//
// Run: node scripts/i18n/check-translations.js
// Expected: exits 0 with "All translation keys verified"
// Fail case: exits 1 with "MISSING AR TRANSLATION: key.path.here"

const fs   = require('fs');
const path = require('path');

const REPO_ROOT   = path.resolve(__dirname, '..', '..');
const LOCALES_DIR = path.join(REPO_ROOT, 'app', 'frontend', 'src', 'locales');
const SOURCE_DIR  = path.join(REPO_ROOT, 'app', 'frontend', 'src');

// Languages that must have FULL translations (non-empty values)
const FULL_LANGS  = ['ar'];
// Languages that must have structural parity but may have empty values
const TIER2_LANGS = ['ur', 'fr', 'es'];

// ── Load locale files ─────────────────────────────────────────────────────────
function loadLocale(lang) {
  const file = path.join(LOCALES_DIR, lang + '.json');
  if (!fs.existsSync(file)) {
    console.error(`ERROR: Missing locale file: ${file}`);
    process.exit(1);
  }
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (err) {
    console.error(`ERROR: Failed to parse ${file}: ${err.message}`);
    process.exit(1);
  }
}

// ── Scan source files for t('key') and t("key") usage ────────────────────────
function scanSourceKeys(dir) {
  const used = new Set();
  const pattern = /\bt\(\s*['"]([^'"]+)['"]\s*\)/g;

  function walk(d) {
    for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
      const full = path.join(d, entry.name);
      if (entry.isDirectory() && entry.name !== 'node_modules' && entry.name !== 'locales') {
        walk(full);
      } else if (entry.isFile() && /\.(js|ts|tsx|jsx)$/.test(entry.name)) {
        const src = fs.readFileSync(full, 'utf8');
        let m;
        while ((m = pattern.exec(src)) !== null) {
          used.add(m[1]);
        }
      }
    }
  }

  walk(dir);
  return used;
}

// ── Main ──────────────────────────────────────────────────────────────────────
let failed = false;

const en = loadLocale('en');
const enKeys = Object.keys(en);

console.log(`[check-translations] en.json: ${enKeys.length} keys`);

// 1. Verify all t('key') usages appear in en.json
const usedKeys = scanSourceKeys(SOURCE_DIR);
console.log(`[check-translations] source files: ${usedKeys.size} unique t() keys found`);

for (const key of usedKeys) {
  if (!(key in en)) {
    console.error(`MISSING EN TRANSLATION: ${key}`);
    failed = true;
  }
}

// 2. Verify ar.json has all keys from en.json with non-empty values
const ar = loadLocale('ar');
console.log(`[check-translations] ar.json: ${Object.keys(ar).length} keys`);

for (const key of enKeys) {
  if (!(key in ar)) {
    console.error(`MISSING AR TRANSLATION: ${key}`);
    failed = true;
  } else if (!ar[key] || String(ar[key]).trim() === '') {
    console.error(`EMPTY AR TRANSLATION: ${key}`);
    failed = true;
  }
}

// 3. Verify tier-2 locales have structural parity (keys present, values may be empty)
for (const lang of TIER2_LANGS) {
  const locale = loadLocale(lang);
  console.log(`[check-translations] ${lang}.json: ${Object.keys(locale).length} keys`);
  for (const key of enKeys) {
    if (!(key in locale)) {
      console.error(`MISSING ${lang.toUpperCase()} STRUCTURE KEY: ${key}`);
      failed = true;
    }
  }
}

// ── Result ────────────────────────────────────────────────────────────────────
if (failed) {
  console.error('\n[check-translations] FAILED — fix missing translations before building');
  process.exit(1);
}

console.log('\n[check-translations] All translation keys verified ✓');
process.exit(0);
