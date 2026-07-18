-- WorkCaptain WO-WC-SEC-02 / SEC-FIX-WC-01B — FORCE ROW LEVEL SECURITY on the
-- invoices billing tables, CODIFICATION OF LIVE STATE (repo↔prod parity).
--
-- WHY THIS EXISTS
--   The tenant-isolation RLS on invoices + invoice_line_items was FORCE-landed
--   directly on the live WorkCaptain DB during the WC-SEC-02 GO-5/GO-6 campaign
--   (2026-06-25) and PROVEN there, but was never captured as a repo migration.
--   This file reconciles the lineage to the live catalog so a fresh build (and the
--   migration history) matches production. It is a MIRROR, not a change:
--   NO behaviour change, NO new isolation semantics beyond what is already live.
--
-- SOURCE OF TRUTH (verified against the live DB, not the migration files)
--   Evidence anchor: ~/g0/runtime-evidence/V1-FINAL-wc-rls.txt
--     sha256 d8a86d9e79dc71f79a9e4c06253c97ad8b581c757f550671c6202aa150ae5c61
--   Live catalog captured under the runtime role wc_app (NOBYPASSRLS):
--     invoices           relrowsecurity=t  relforcerowsecurity=t  owner=prowork
--     invoice_line_items relrowsecurity=t  relforcerowsecurity=t  owner=prowork
--     policy wc_sec02_invoices_tenant_isolation   ON invoices           roles={public} cmd=ALL
--       USING (tenant_id = current_setting('app.current_tenant_id'::text, true))
--     policy wc_sec02_line_items_tenant_isolation ON invoice_line_items roles={public} cmd=ALL
--       USING (EXISTS (SELECT 1 FROM invoices i
--                        WHERE i.id = invoice_line_items.invoice_id
--                          AND i.tenant_id = current_setting('app.current_tenant_id'::text, true)))
--     with_check is NULL on both (FOR ALL policies fall back to USING for the check).
--
-- FK NOTE (deliberate omission)
--   Live has ZERO foreign-key constraints on invoice_line_items.invoice_id
--   (V1-FINAL-wc-rls.txt ===FK=== → 0 rows), even though 20260617_create_invoices.sql
--   declares one inline — a PRE-EXISTING repo↔live divergence from the force-land.
--   Isolation holds via the EXISTS-join policy regardless of the FK. To keep this
--   migration a faithful MIRROR of live (no behaviour change), the optional FK is
--   NOT added here; adding it would push the repo further from the live state this
--   file exists to codify. Tracked as a separate parity observation for delta-review.
--
-- SAFETY
--   * Repo-only codification. NOT applied to prod by this lane (gates 1 & 4).
--   * Idempotent: ENABLE/FORCE RLS are no-ops if already set; policies are
--     DROP ... IF EXISTS then CREATE, so a re-run (incl. against the already-live DB)
--     converges to the same catalog with no error and no data mutation.
--   * DDL only — no INSERT/UPDATE/DELETE, no DROP TABLE, no grant change.

-- ── invoices ────────────────────────────────────────────────────────────────
alter table invoices enable row level security;
alter table invoices force  row level security;

drop policy if exists wc_sec02_invoices_tenant_isolation on invoices;
create policy wc_sec02_invoices_tenant_isolation on invoices
  for all
  using (tenant_id = current_setting('app.current_tenant_id', true));

-- ── invoice_line_items (scoped through the parent invoice's tenant_id) ────────
alter table invoice_line_items enable row level security;
alter table invoice_line_items force  row level security;

drop policy if exists wc_sec02_line_items_tenant_isolation on invoice_line_items;
create policy wc_sec02_line_items_tenant_isolation on invoice_line_items
  for all
  using (
    exists (
      select 1
      from invoices i
      where i.id = invoice_line_items.invoice_id
        and i.tenant_id = current_setting('app.current_tenant_id', true)
    )
  );
