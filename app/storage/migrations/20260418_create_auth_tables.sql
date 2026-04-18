-- S40-G1: Authentication tables — users, sessions
-- Row-Level Security enforces tenant isolation

BEGIN;

-- ── users ─────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email         VARCHAR(255) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  tenant_id     VARCHAR(64)  NOT NULL REFERENCES tenants(id),
  role          VARCHAR(32)  NOT NULL DEFAULT 'VIEWER'
    CHECK (role IN ('OWNER','ADMIN','HIRING_MANAGER','FINANCE_APPROVER','VIEWER')),
  status        VARCHAR(32)  NOT NULL DEFAULT 'INVITED'
    CHECK (status IN ('ACTIVE','INVITED','SUSPENDED')),
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  last_login_at TIMESTAMPTZ,
  UNIQUE (email, tenant_id)
);

CREATE INDEX IF NOT EXISTS idx_users_tenant  ON users(tenant_id);
CREATE INDEX IF NOT EXISTS idx_users_email   ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_status  ON users(status);

-- ── sessions ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS sessions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID         NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash  VARCHAR(128) NOT NULL UNIQUE,
  expires_at  TIMESTAMPTZ  NOT NULL,
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  ip_address  INET,
  user_agent  TEXT
);

CREATE INDEX IF NOT EXISTS idx_sessions_user      ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_expires    ON sessions(expires_at);
CREATE INDEX IF NOT EXISTS idx_sessions_token_hash ON sessions(token_hash);

-- ── Row-Level Security ────────────────────────────────────────────────────────
-- Enable RLS on both tables
ALTER TABLE users    ENABLE ROW LEVEL SECURITY;
ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;

-- Users: prowork_app can only see rows matching current tenant setting
CREATE POLICY tenant_isolation_users ON users
  USING (tenant_id = current_setting('app.current_tenant_id', true));

-- Sessions: prowork_app can only see sessions for users in current tenant
CREATE POLICY tenant_isolation_sessions ON sessions
  USING (user_id IN (
    SELECT id FROM users WHERE tenant_id = current_setting('app.current_tenant_id', true)
  ));

-- Grant minimal privileges to prowork_app (append-only pattern)
GRANT SELECT, INSERT ON users TO prowork_app;
GRANT UPDATE (status, last_login_at, password_hash) ON users TO prowork_app;
GRANT SELECT, INSERT, DELETE ON sessions TO prowork_app;

COMMIT;
