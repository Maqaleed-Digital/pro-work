create schema if not exists prowork;

create table if not exists prowork.sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  refresh_token_hash text not null,
  rotated_from_session_id uuid null references prowork.sessions(id) on delete set null,
  user_agent text null,
  ip inet null,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  expires_at timestamptz not null,
  revoked_at timestamptz null,
  revoke_reason text null
);

create index if not exists prowork_sessions_user_id_idx on prowork.sessions(user_id);
create index if not exists prowork_sessions_refresh_token_hash_idx on prowork.sessions(refresh_token_hash);
create index if not exists prowork_sessions_revoked_at_idx on prowork.sessions(revoked_at);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'prowork_sessions_refresh_token_hash_uniq'
  ) then
    alter table prowork.sessions
      add constraint prowork_sessions_refresh_token_hash_uniq unique (refresh_token_hash);
  end if;
end;
$$;

create or replace function prowork.touch_session(p_session_id uuid)
returns void
language plpgsql
as $$
begin
  update prowork.sessions
  set last_seen_at = now()
  where id = p_session_id and revoked_at is null;
end;
$$;
