-- S40-G6: Team invitations table
-- RLS tenant isolation, column-level UPDATE grants

BEGIN;

CREATE TABLE IF NOT EXISTS invitations (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   VARCHAR(64)  NOT NULL REFERENCES tenants(id),
  email       VARCHAR(255) NOT NULL,
  role        VARCHAR(32)  NOT NULL
    CHECK (role IN ('OWNER','ADMIN','HIRING_MANAGER','FINANCE_APPROVER','VIEWER')),
  token       VARCHAR(128) NOT NULL UNIQUE,
  invited_by  UUID         NOT NULL REFERENCES users(id),
  status      VARCHAR(32)  NOT NULL DEFAULT 'PENDING'
    CHECK (status IN ('PENDING','ACCEPTED','EXPIRED')),
  expires_at  TIMESTAMPTZ  NOT NULL,
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_invitations_tenant  ON invitations(tenant_id);
CREATE INDEX IF NOT EXISTS idx_invitations_token   ON invitations(token);
CREATE INDEX IF NOT EXISTS idx_invitations_email   ON invitations(email);
CREATE INDEX IF NOT EXISTS idx_invitations_status  ON invitations(status);

-- Row-Level Security
ALTER TABLE invitations ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_invitations ON invitations
  USING (tenant_id = current_setting('app.current_tenant_id', true));

-- Grants: prowork_app can INSERT, SELECT, UPDATE(status) only
GRANT SELECT, INSERT ON invitations TO prowork_app;
GRANT UPDATE (status) ON invitations TO prowork_app;

COMMIT;
