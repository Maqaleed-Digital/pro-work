begin;

create extension if not exists pgcrypto;

create table if not exists public.auth_sessions (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid not null,
  token_hash text not null unique,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  revoked_at timestamptz null,
  last_seen_at timestamptz null,
  ip inet null,
  user_agent text null
);

create index if not exists auth_sessions_actor_id_idx on public.auth_sessions(actor_id);
create index if not exists auth_sessions_expires_at_idx on public.auth_sessions(expires_at);
create index if not exists auth_sessions_revoked_at_idx on public.auth_sessions(revoked_at);

commit;
