-- WorkCaptain WO-WC-SEC-01 — bounded login-only tenant lookup (SECURITY DEFINER).
-- AUTHORED FOR GO-3a — NOT APPLIED HERE.
--
-- WHY: the pre-auth login path (auth_router.js:111) runs a BARE cross-tenant query
--   `SELECT tenant_id FROM users WHERE email = $1 LIMIT 1`
-- with no tenant GUC set. It works today ONLY because prowork_app OWNS `users` and the table is
-- ENABLE-not-FORCE RLS, so the owner bypasses the (fail-CLOSED) users policy. Once users is made
-- FORCE RLS (the real fix — see GO-1 notes), that bare lookup would correctly return zero rows and
-- login would break. This function is the bounded, login-only escape hatch that replaces the
-- owner-bypass reliance.
--
-- BOUNDED — this is NOT a general cross-tenant SELECT:
--   * returns ONLY the columns login needs: id, tenant_id, password_hash, role, status.
--   * filtered to exactly one email (the supplied arg), normalized lower/trim.
--   * SECURITY DEFINER, owned by a privileged role (prowork_owner) so it reads users regardless of
--     RLS — but it can ONLY ever return the login columns for one email, nothing else.
--   * search_path pinned (no mutable-search_path injection on a SECURITY DEFINER fn).
--   * EXECUTE granted to prowork_app only.
--
-- Email is UNIQUE (email, tenant_id) — per-tenant, NOT global — so an email may exist in multiple
-- tenants. The function returns SETOF (all matches); the app verifies the password against each row
-- and, on the single match, adopts that row's tenant_id. (This preserves today's behavior without a
-- bare cross-tenant table read, and removes the LIMIT-1-arbitrary-tenant bug.)

create or replace function wc_login_lookup(p_email text)
returns table (id uuid, tenant_id varchar(64), password_hash varchar(255), role varchar(32), status varchar(32))
language sql
security definer
set search_path = pg_catalog, public
stable
as $$
  select u.id, u.tenant_id, u.password_hash, u.role, u.status
    from public.users u
   where u.email = lower(btrim(p_email))
$$;

-- Definer = the privileged owner role (so it is not subject to RLS); least-privilege execute.
alter function wc_login_lookup(text) owner to prowork_owner;
revoke all on function wc_login_lookup(text) from public;
grant execute on function wc_login_lookup(text) to prowork_app;


-- ─────────────────────────────────────────────────────────────────────────────
-- WO-WC-SEC-01 — bounded PRE-AUTH invitation-token lookup (SECURITY DEFINER).
--
-- WHY: invitation_service.acceptInvitation() looks up an invitation by its opaque token BEFORE any
-- authentication — there is NO tenantId in scope yet (the tenant is discovered FROM the looked-up
-- row). That bare `SELECT ... FROM invitations WHERE token = $1` works today ONLY because prowork_app
-- owns `invitations` and the table is ENABLE-not-FORCE RLS (owner-bypass). Once invitations is made
-- FORCE RLS, that lookup runs with NO app.current_tenant_id GUC set and the fail-CLOSED policy returns
-- ZERO rows → accept-invite breaks. This function is the bounded, accept-invite-only escape hatch,
-- mirroring wc_login_lookup.
--
-- BOUNDED — NOT a general cross-tenant SELECT:
--   * returns ONLY the columns acceptInvitation needs: id, tenant_id, email, role, status, expires_at.
--   * filtered to exactly one token (the supplied arg) — token is globally UNIQUE on invitations.
--   * SECURITY DEFINER, owned by prowork_owner so it reads invitations regardless of RLS — but can
--     ONLY ever return the six accept-invite columns for one token, nothing else.
--   * search_path pinned (no mutable-search_path injection on a SECURITY DEFINER fn).
--   * EXECUTE granted to prowork_app only.
--
-- AFTER this lookup returns, tenant_id is KNOWN (from the row), so every subsequent write in
-- acceptInvitation is tenant-scoped through the shared withTenant(pool, inv.tenant_id, ...) helper.

create or replace function wc_invitation_lookup(p_token text)
returns table (id uuid, tenant_id varchar(64), email varchar(255), role varchar(32), status varchar(32), expires_at timestamptz)
language sql
security definer
set search_path = pg_catalog, public
stable
as $$
  select i.id, i.tenant_id, i.email, i.role, i.status, i.expires_at
    from public.invitations i
   where i.token = p_token
$$;

-- Definer = the privileged owner role (so it is not subject to RLS); least-privilege execute.
alter function wc_invitation_lookup(text) owner to prowork_owner;
revoke all on function wc_invitation_lookup(text) from public;
grant execute on function wc_invitation_lookup(text) to prowork_app;
