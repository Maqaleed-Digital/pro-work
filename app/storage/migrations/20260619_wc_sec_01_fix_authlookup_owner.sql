-- WO-WC-SEC-01 GO-4-FIX — re-own the pre-auth SECURITY DEFINER fns to a bounded BYPASSRLS role.
-- AUTHORED FOR GO-3a-delta — NOT APPLIED HERE.
--
-- ROOT CAUSE (GO-4 crash): wc_login_lookup / wc_invitation_lookup were owned by `prowork_owner`,
-- which has NO SELECT on `users`/`invitations` (those are owned by `prowork`). A SECURITY DEFINER
-- function runs AS ITS OWNER, so the pre-auth lookup read `users` as `prowork_owner` →
-- "permission denied for table users" (SQLSTATE 42501) → unhandled rejection crashed the app.
-- DEEPER: even WITH a SELECT grant, a NOBYPASSRLS owner would, once `users` is FORCE ROW LEVEL
-- SECURITY (GO-3c), be subject to the users policy → zero rows pre-auth (no GUC set) → login
-- resolves no tenant. The pre-auth cross-tenant lookup is, by nature, the operation that runs
-- BEFORE tenant context exists, so it must bypass RLS — but only for that bounded read.
--
-- FIX: a dedicated `wc_auth_lookup` role — NOLOGIN, BYPASSRLS, NOINHERIT — that owns ONLY the two
-- pre-auth functions and is granted SELECT on ONLY `users`/`invitations`. The functions then read
-- cross-tenant pre-auth AND survive FORCE RLS. DL-109 §3 is intact: the RUNTIME role `wc_app`
-- stays NOBYPASSRLS and owns nothing; BYPASSRLS is confined to two functions that return login
-- columns only, off the tenant-traffic connection path. (Rationale recorded at WC-SEC-01 close.)

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'wc_auth_lookup') then
    create role wc_auth_lookup nologin bypassrls noinherit;
  end if;
end $$;

-- The migration runner must be a member of the new owning role to re-assign ownership to it.
grant wc_auth_lookup to current_user;

-- Minimum reads: only the two tables the pre-auth lookups touch.
grant select on public.users       to wc_auth_lookup;
grant select on public.invitations to wc_auth_lookup;

-- Re-own the two pre-auth definer fns from prowork_owner → wc_auth_lookup (the BYPASSRLS owner).
alter function wc_login_lookup(text)      owner to wc_auth_lookup;
alter function wc_invitation_lookup(text) owner to wc_auth_lookup;

-- Re-assert the bounded execute scope (owner change preserves grants; explicit + idempotent).
revoke all on function wc_login_lookup(text)      from public;
revoke all on function wc_invitation_lookup(text) from public;
grant execute on function wc_login_lookup(text)      to wc_app, prowork_app;
grant execute on function wc_invitation_lookup(text) to wc_app, prowork_app;
