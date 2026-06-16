-- WC-02: append-only ToS acceptance ledger
-- One row per acceptance (invitation accept / auth register); never updated or deleted.

CREATE TABLE IF NOT EXISTS tos_acceptances (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID NOT NULL,
  tenant_id        TEXT,
  tos_version      TEXT NOT NULL,
  accepted_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  acceptance_source TEXT NOT NULL CHECK (acceptance_source IN ('invitation_accept','auth_register'))
);

CREATE INDEX IF NOT EXISTS idx_tos_acceptances_user ON tos_acceptances(user_id);

-- Append-only grant (matches phase2 pattern). No UPDATE/DELETE.
-- Guarded so it no-ops if the prowork_app role is absent.
DO $$
BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'prowork_app') THEN
    GRANT INSERT, SELECT ON tos_acceptances TO prowork_app;
  END IF;
END $$;
