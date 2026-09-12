#!/usr/bin/env node
'use strict';

/**
 * WC-005 — whole-schema tenant-isolation conformance reconciliation (STATIC LAYER A).
 *
 * SCOPE AND ITS LIMIT — read this before trusting any output.
 * ----------------------------------------------------------
 * This reads the REPOSITORY (migrations + serving code). It does NOT read pg_catalog.
 * Nothing here may be cited as live database truth. A table reported STATIC_CONFORMANT
 * is conformant *in the migration corpus*; whether the live database agrees is a separate
 * proof that needs a credentialed in-VPC path (LIVE_RLS_PROOF).
 *
 * This is reconciliation, NOT a claim that tenant isolation is broken. WC-SEC-01 is closed
 * on live-proven AC1-AC8 evidence and is not reopened here.
 *
 * KNOWN HAZARD THIS EXISTS TO SURFACE
 * -----------------------------------
 * The corpus keys policies on THREE different GUCs:
 *   app.current_tenant_id  (text)  — set by the helper
 *   app.tenant_id          (uuid)  — set by the helper
 *   app.current_tenant             — never set in code; permanently NULL (re-keyed in
 *                                    20260619_wc_sec_01_force_rls.sql)
 * A policy keyed on a GUC the serving path never sets evaluates against NULL. Whether that
 * fails open or closed depends on the predicate, so the GUC a policy uses is reported per
 * table rather than assumed uniform.
 *
 * PARSING HONESTY
 * ---------------
 * DDL is matched textually. That is sufficient for this corpus (plain CREATE/ALTER/CREATE
 * POLICY, no dynamic SQL generating DDL — asserted below and reported if violated), but it
 * is a weaker instrument than a real parser. Anything it cannot decide is reported UNKNOWN,
 * never assumed conformant.
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const MIGRATIONS = path.join(ROOT, 'app', 'storage', 'migrations');

const sql = fs
  .readdirSync(MIGRATIONS)
  .filter((f) => f.endsWith('.sql'))
  .sort()
  .map((f) => ({ file: f, text: fs.readFileSync(path.join(MIGRATIONS, f), 'utf8') }));

// Strip line comments so commented-out DDL is never counted as declared.
const strip = (t) => t.replace(/--[^\n]*/g, '');

const tables = new Map();
const get = (name) => {
  if (!tables.has(name)) {
    tables.set(name, {
      table: name,
      tenant_key: null,
      tenant_scoped: 'no',
      rls_declared: false,
      force_declared: false,
      policyByName: new Map(),
      created_in: [],
      evidence: [],
    });
  }
  return tables.get(name);
};

const ident = '([a-zA-Z_][a-zA-Z0-9_]*)';

for (const { file, text } of sql) {
  const t = strip(text);

  // CREATE TABLE [IF NOT EXISTS] name ( ...body... )
  const createRe = new RegExp(`create\\s+table\\s+(?:if\\s+not\\s+exists\\s+)?${ident}\\s*\\(`, 'gi');
  let m;
  while ((m = createRe.exec(t))) {
    const name = m[1];
    // Balance parens from the opening one to capture the column body.
    let i = createRe.lastIndex - 1, depth = 0, body = '';
    for (; i < t.length; i++) {
      const ch = t[i];
      if (ch === '(') depth++;
      if (ch === ')') { depth--; if (depth === 0) break; }
      if (depth >= 1) body += ch;
    }
    const rec = get(name);
    rec.created_in.push(file);
    if (/\btenant_id\b/i.test(body)) {
      rec.tenant_scoped = 'yes';
      rec.tenant_key = 'tenant_id';
      rec.evidence.push(`tenant_id column declared in ${file}`);
    }
  }

  for (const re of [
    new RegExp(`alter\\s+table\\s+(?:only\\s+)?${ident}[\\s\\S]{0,80}?enable\\s+row\\s+level\\s+security`, 'gi'),
  ]) {
    while ((m = re.exec(t))) {
      const rec = get(m[1]);
      rec.rls_declared = true;
      rec.evidence.push(`ENABLE RLS in ${file}`);
    }
  }
  for (const re of [
    new RegExp(`alter\\s+table\\s+(?:only\\s+)?${ident}[\\s\\S]{0,80}?force\\s+row\\s+level\\s+security`, 'gi'),
  ]) {
    while ((m = re.exec(t))) {
      const rec = get(m[1]);
      rec.force_declared = true;
      rec.evidence.push(`FORCE RLS in ${file}`);
    }
  }

  // CREATE POLICY <p> ON <table> ... capture predicate to find the GUC it keys on.
  const polRe = new RegExp(`create\\s+policy\\s+${ident}\\s+on\\s+${ident}([\\s\\S]{0,400}?);`, 'gi');
  while ((m = polRe.exec(t))) {
    const rec = get(m[2]);
    // A later migration may drop+recreate a policy of the same name (nitaqat_preview_overrides
    // is re-keyed off the dead app.current_tenant GUC in 20260619). Files are date-prefixed and
    // read in sorted order, so LAST definition wins — modelling apply order, not file union.
    const gucs = (m[3].match(/current_setting\('([^']+)'/g) || [])
      .map((g) => g.replace(/current_setting\('/, '').replace(/'$/, ''));
    rec.policyByName.set(m[1], { name: m[1], file, gucs });
    rec.evidence.push(`policy ${m[1]} in ${file}`);
  }
}

// Assert the textual instrument is adequate for this corpus: no dynamic DDL.
const dynamicDdl = sql.filter(({ text }) =>
  /execute\s+format\s*\(|execute\s+'[^']*create\s+(table|policy)/i.test(strip(text))
);

// GUCs the serving code actually sets.
const codeFiles = [];
(function walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name.startsWith('.')) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p);
    else if (e.name.endsWith('.js')) codeFiles.push(p);
  }
})(path.join(ROOT, 'app'));

const setGucs = new Set();
for (const f of codeFiles) {
  const txt = fs.readFileSync(f, 'utf8');
  for (const g of txt.match(/set_config\('([^']+)'/g) || []) {
    setGucs.add(g.replace(/set_config\('/, '').replace(/'$/, ''));
  }
}

const rows = [...tables.values()].map((r) => {
  r.policies = [...r.policyByName.values()];
  const gucs = [...new Set(r.policies.flatMap((p) => p.gucs))];
  const unsetGucs = gucs.filter((g) => !setGucs.has(g));
  let status;
  if (r.tenant_scoped !== 'yes') {
    status = 'GLOBAL_REFERENCE';
  } else if (!r.rls_declared) {
    status = 'STATIC_GAP';
  } else if (r.policies.length === 0) {
    status = 'STATIC_GAP';            // RLS enabled, no policy = implicit deny-all
  } else if (unsetGucs.length > 0) {
    status = 'STATIC_GAP';            // policy keys a GUC nothing sets
  } else if (!r.force_declared) {
    status = 'UNKNOWN_NEEDS_LIVE_PROOF'; // RLS+policy but not forced: owner bypasses
  } else {
    status = 'STATIC_CONFORMANT';
  }
  return {
    table: r.table,
    tenant_scoped: r.tenant_scoped,
    tenant_key: r.tenant_key,
    rls_declared: r.rls_declared,
    force_declared: r.force_declared,
    policy_present: r.policies.length > 0,
    policy_count: r.policies.length,
    guc_names: gucs,
    guc_never_set_in_code: unsetGucs,
    served_in_prod: 'unknown',
    live_proof: 'NOT_ATTEMPTED_STATIC_LAYER_ONLY',
    status,
    evidence: r.evidence,
  };
}).sort((a, b) => a.table.localeCompare(b.table));

const summary = {
  generated_utc: new Date().toISOString(),
  layer: 'A_STATIC_REPO_ONLY',
  live_pg_catalog_consulted: false,
  migrations_scanned: sql.length,
  dynamic_ddl_files: dynamicDdl.map((d) => d.file),
  gucs_referenced_by_policies: [...new Set(rows.flatMap((r) => r.guc_names))].sort(),
  gucs_set_by_serving_code: [...setGucs].sort(),
  tables_total: rows.length,
  tenant_scoped: rows.filter((r) => r.tenant_scoped === 'yes').length,
  counts: rows.reduce((a, r) => ((a[r.status] = (a[r.status] || 0) + 1), a), {}),
};

if (process.argv.includes('--json')) {
  console.log(JSON.stringify({ summary, rows }, null, 2));
} else {
  console.log('┌─ WC-005 static tenant-isolation matrix (LAYER A — repo only) ─');
  console.log(`│  migrations scanned : ${summary.migrations_scanned}`);
  console.log(`│  tables discovered  : ${summary.tables_total}`);
  console.log(`│  tenant-scoped      : ${summary.tenant_scoped}`);
  console.log(`│  live pg_catalog    : NOT consulted — this is not live truth`);
  console.log('└──────────────────────────────────────────────────────────────\n');
  if (dynamicDdl.length) {
    console.log(`  WARNING: dynamic DDL present, textual parse may be incomplete: ${dynamicDdl.map(d=>d.file).join(', ')}\n`);
  }
  console.log(`  GUCs referenced by policies : ${summary.gucs_referenced_by_policies.join(', ')}`);
  console.log(`  GUCs set by serving code    : ${summary.gucs_set_by_serving_code.join(', ')}`);
  const orphan = summary.gucs_referenced_by_policies.filter((g) => !summary.gucs_set_by_serving_code.includes(g));
  console.log(`  GUCs NEVER set in code      : ${orphan.length ? orphan.join(', ') : '(none)'}\n`);
  for (const [k, v] of Object.entries(summary.counts).sort()) console.log(`  ${k.padEnd(28)} ${v}`);
  console.log('\n  STATIC_GAP tables:');
  for (const r of rows.filter((r) => r.status === 'STATIC_GAP')) {
    const why = !r.rls_declared ? 'no RLS declared'
      : !r.policy_present ? 'RLS enabled with NO policy (implicit deny-all)'
      : `policy keys GUC never set in code: ${r.guc_never_set_in_code.join(', ')}`;
    console.log(`    ${r.table.padEnd(38)} ${why}`);
  }
}
