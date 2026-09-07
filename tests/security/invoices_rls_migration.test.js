'use strict';

/**
 * WC002-04 T3 — repo-side checks for the invoices RLS + privilege drift closure.
 *
 * These are STATIC checks over the migration text. They exist because the real
 * proof — tests/db/run_wc_sec_02_force_rls.sh — needs Docker and cannot run on
 * every CI job, so the structural invariants that make that migration safe are
 * asserted here where they always run.
 *
 * What these tests deliberately do NOT do: claim anything about production. No
 * test here connects to a database, and none may be read as evidence that the
 * live DB has (or lacks) the control. Live carries this control since 25 Jun 2026;
 * these files describe it, they do not establish it.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs   = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const MIG  = path.join(ROOT, 'app/storage/migrations');

const RLS_MIG   = path.join(MIG, '20260625_wc_sec_02_force_rls_invoices.sql');
const GRANT_MIG = path.join(MIG, '20260907_wc002_04_invoices_grant_boundary.sql');

const read = f => fs.readFileSync(f, 'utf8');
// Comment-stripped view, so a construct mentioned only in prose never satisfies
// an assertion about executable SQL.
const sql  = f => read(f).split('\n').filter(l => !l.trim().startsWith('--')).join('\n');

describe('Suite 1: both drift-closure migrations exist and parse structurally', () => {
  for (const [name, file] of [['RLS', RLS_MIG], ['grant boundary', GRANT_MIG]]) {
    it(`${name} migration file exists`, () => {
      assert.ok(fs.existsSync(file), `missing migration: ${path.relative(ROOT, file)}`);
    });

    it(`${name} migration has balanced $$ blocks`, () => {
      const dollars = (sql(file).match(/\$\$/g) || []).length;
      assert.equal(dollars % 2, 0, 'unbalanced $$ — the file would not parse');
    });

    it(`${name} migration has balanced parentheses`, () => {
      const body = sql(file);
      let depth = 0;
      for (const ch of body) {
        if (ch === '(') depth++;
        else if (ch === ')') depth--;
        assert.ok(depth >= 0, 'unbalanced parentheses — closes before it opens');
      }
      assert.equal(depth, 0, 'unbalanced parentheses');
    });

    it(`${name} migration terminates its final statement`, () => {
      assert.match(sql(file).trim(), /;$/, 'last statement must end with a semicolon');
    });

    it(`${name} migration performs no DML and drops no table`, () => {
      // Anchored to statement starts: a bare substring search matches the word
      // `update` inside `grant select, insert, update, delete`, which is a
      // privilege name, not a data modification.
      const forbidden = [
        [/^\s*insert\s+into\b/im,  'INSERT'   ],
        [/^\s*update\s+\w/im,       'UPDATE'   ],
        [/^\s*delete\s+from\b/im,  'DELETE'   ],
        [/^\s*drop\s+table\b/im,   'DROP TABLE'],
        [/^\s*truncate\b/im,       'TRUNCATE' ],
      ];
      for (const [re, label] of forbidden) {
        assert.ok(!re.test(sql(file)),
          `drift closure must not ${label} — it describes state, it does not move data`);
      }
    });
  }
});

describe('Suite 2: idempotency by construction (DL-064 is binding)', () => {
  it('every CREATE POLICY is preceded by a DROP POLICY IF EXISTS', () => {
    const body = sql(RLS_MIG);
    const creates = (body.match(/create policy/gi) || []).length;
    const drops   = (body.match(/drop policy if exists/gi) || []).length;
    assert.ok(creates > 0, 'the RLS migration must create policies');
    assert.equal(drops, creates,
      `each of the ${creates} CREATE POLICY needs a matching DROP POLICY IF EXISTS`);
  });

  it('no CREATE POLICY appears without the IF EXISTS guard anywhere in the file', () => {
    assert.ok(!/(?<!drop policy if exists[\s\S]{0,400})create policy/i.test('') , 'structural placeholder');
    const lines = sql(RLS_MIG).split('\n');
    const createIdx = lines.map((l, i) => /create policy/i.test(l) ? i : -1).filter(i => i >= 0);
    for (const i of createIdx) {
      const before = lines.slice(Math.max(0, i - 6), i).join('\n');
      assert.match(before, /drop policy if exists/i,
        `CREATE POLICY at line ${i + 1} has no DROP ... IF EXISTS immediately before it`);
    }
  });

  it('every role-dependent GRANT/REVOKE is guarded by a pg_roles existence check', () => {
    // An unguarded GRANT/REVOKE against a role that does not exist aborts the
    // migration, which is exactly the DL-064 re-run landmine.
    const body = sql(GRANT_MIG);
    const guards = (body.match(/if exists \(select 1 from pg_roles where rolname = '[a-z_]+'\)/gi) || []);
    assert.ok(guards.length >= 3,
      `expected a pg_roles guard per named role; found ${guards.length}`);
    for (const role of ['wc_app', 'prowork_app', 'anon']) {
      assert.ok(body.includes(`rolname = '${role}'`),
        `${role} must be reached through a pg_roles existence guard`);
    }
  });

  it('only PUBLIC is touched unguarded — PUBLIC always exists', () => {
    const body = sql(GRANT_MIG);
    const unguarded = body
      .split(/do \$\$[\s\S]*?end \$\$;/gi).join('\n')   // remove guarded blocks
      .split('\n')
      .filter(l => /^\s*(grant|revoke)\b/i.test(l));
    assert.ok(unguarded.length > 0, 'expected the PUBLIC revokes at top level');
    for (const line of unguarded) {
      assert.match(line, /from public\s*;/i,
        `unguarded privilege statement must target PUBLIC only: ${line.trim()}`);
    }
  });

  it('ENABLE/FORCE ROW LEVEL SECURITY are inherently re-runnable (no IF NOT EXISTS needed)', () => {
    const body = sql(RLS_MIG);
    assert.match(body, /alter table invoices\s+enable row level security/i);
    assert.match(body, /alter table invoices\s+force\s+row level security/i);
    assert.match(body, /alter table invoice_line_items\s+enable row level security/i);
    assert.match(body, /alter table invoice_line_items\s+force\s+row level security/i);
  });
});

describe('Suite 3: the privilege boundary is stated, not assumed', () => {
  it('PUBLIC is explicitly revoked on BOTH billing tables', () => {
    const body = sql(GRANT_MIG);
    assert.match(body, /revoke all on public\.invoices\s+from public\s*;/i);
    assert.match(body, /revoke all on public\.invoice_line_items\s+from public\s*;/i);
  });

  it('anon is revoked separately from PUBLIC — a named role keeps direct grants', () => {
    const body = sql(GRANT_MIG);
    assert.match(body, /revoke all on public\.invoices\s+from anon/i);
    assert.match(body, /revoke all on public\.invoice_line_items\s+from anon/i);
  });

  it('wc_app holds explicit DML on both tables, not a point-in-time blanket grant', () => {
    const body = sql(GRANT_MIG);
    assert.match(body, /grant select, insert, update, delete on public\.invoices\s+to wc_app/i);
    assert.match(body, /grant select, insert, update, delete on public\.invoice_line_items to wc_app/i);
  });

  it('line-item isolation goes through the parent invoice, matching live', () => {
    // Design choice A (EXISTS join on invoice_id), not a denormalised tenant_id:
    // invoice_line_items has no tenant_id column, and live uses the join.
    const body = sql(RLS_MIG);
    assert.match(body, /exists\s*\(\s*select 1\s+from invoices i/i);
    assert.match(body, /i\.id = invoice_line_items\.invoice_id/i);
    assert.match(body, /i\.tenant_id = current_setting\('app\.current_tenant_id', true\)/i);
    assert.ok(!/invoice_line_items\.tenant_id/i.test(body),
      'must not assume a denormalised tenant_id the schema does not have');
  });
});

describe('Suite 4: the header tells the truth about what this migration is', () => {
  const header = read(GRANT_MIG).split('\n').filter(l => l.trim().startsWith('--')).join('\n');

  it('states that it describes state already live', () => {
    assert.match(header, /already live/i);
    assert.match(header, /25 Jun 2026/i);
  });

  it('states that it is drift closure, not a newly introduced control', () => {
    assert.match(header, /drift closure/i);
    assert.match(header, /NOT evidence that the control is\s*--\s*newly introduced/i);
  });

  it('warns against blind application to production and names the gate', () => {
    assert.match(header, /must NOT be blindly applied to production/i);
    assert.match(header, /separately gated \(G1\)/i);
  });

  it('records why anon is guarded rather than assumed to exist', () => {
    assert.match(header, /no `anon` role in/i);
    assert.match(header, /REVOKE \.\.\. FROM PUBLIC does not remove privileges held by a named role/i);
  });
});

describe('Suite 5: the real-Postgres harness actually covers these files', () => {
  const runner = read(path.join(ROOT, 'tests/db/run_wc_sec_02_force_rls.sh'));

  it('the docker harness applies the grant-boundary migration', () => {
    assert.ok(runner.includes('20260907_wc002_04_invoices_grant_boundary.sql'),
      'the grant migration must be exercised by the real-Postgres harness');
  });

  it('the harness applies each migration twice — idempotency is executed, not asserted in prose', () => {
    const rls   = (runner.match(/20260625_wc_sec_02_force_rls_invoices\.sql/g) || []).length;
    const grant = (runner.match(/20260907_wc002_04_invoices_grant_boundary\.sql/g) || []).length;
    assert.ok(rls   >= 2, `RLS migration applied ${rls} time(s); needs >= 2 for idempotency`);
    assert.ok(grant >= 2, `grant migration applied ${grant} time(s); needs >= 2 for idempotency`);
  });

  it('the harness proves grant SUFFICIENCY, not just presence', () => {
    assert.ok(runner.includes('wc002_04_grant_sufficiency.setup.sql'),
      'the fixture grants must be stripped so the migration is the only thing that can restore them');
    assert.ok(fs.existsSync(path.join(ROOT, 'tests/db/wc002_04_grant_sufficiency.setup.sql')));
  });

  it('the harness runs the grant assertions and requires an explicit PASS token', () => {
    assert.ok(runner.includes('wc002_04_invoices_grant_boundary.assertions.sql'));
    assert.ok(runner.includes('ALL_ASSERTIONS_PASS'),
      'the harness must require a positive PASS token, not merely a zero exit');
  });

  it('tenant isolation is verified AS wc_app, never as the DDL/owner role', () => {
    const asserts = read(path.join(ROOT, 'tests/db/wc002_04_invoices_grant_boundary.assertions.sql'));
    assert.match(asserts, /set role wc_app;/);
    assert.ok(!/set role prowork_ddl/i.test(asserts),
      'verification must never run as prowork_ddl');
  });
});
