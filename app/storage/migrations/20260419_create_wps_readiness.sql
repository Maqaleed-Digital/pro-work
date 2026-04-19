-- S44-G2: WPS Readiness tables
-- RLS enforced. Append-only audit spine on wps_readiness_events.

BEGIN;

-- ── wps_readiness_packs ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS wps_readiness_packs (
  id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id                   VARCHAR(64) NOT NULL REFERENCES tenants(id),
  contract_id                 UUID NOT NULL REFERENCES contracts(id),
  candidate_id                UUID NOT NULL REFERENCES candidates(id),
  status                      VARCHAR(32) NOT NULL DEFAULT 'NOT_STARTED'
    CHECK (status IN ('NOT_STARTED','IN_PROGRESS','READY','SUBMITTED_TO_MUDAD','REJECTED')),
  iban_masked                 TEXT,
  iban_hash                   TEXT,
  iban_verified_at            TIMESTAMPTZ,
  identity_status             VARCHAR(16) NOT NULL DEFAULT 'PENDING'
    CHECK (identity_status IN ('PENDING','VERIFIED','REJECTED')),
  identity_verified_at        TIMESTAMPTZ,
  bank_confirmation_status    VARCHAR(16) NOT NULL DEFAULT 'PENDING'
    CHECK (bank_confirmation_status IN ('PENDING','CONFIRMED','FAILED')),
  bank_confirmation_at        TIMESTAMPTZ,
  salary_amount_sar           NUMERIC,
  salary_breakdown_json       JSONB DEFAULT '{}',
  readiness_score_pct         INTEGER NOT NULL DEFAULT 0,
  last_artifact_generated_at  TIMESTAMPTZ,
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_wps_packs_tenant   ON wps_readiness_packs(tenant_id);
CREATE INDEX IF NOT EXISTS idx_wps_packs_contract ON wps_readiness_packs(contract_id);
CREATE INDEX IF NOT EXISTS idx_wps_packs_status   ON wps_readiness_packs(status);

-- ── wps_readiness_events (audit spine — append-only) ────────────────────────
CREATE TABLE IF NOT EXISTS wps_readiness_events (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id               VARCHAR(64) NOT NULL REFERENCES tenants(id),
  wps_readiness_pack_id   UUID NOT NULL REFERENCES wps_readiness_packs(id),
  event_type              VARCHAR(32) NOT NULL
    CHECK (event_type IN ('PACK_CREATED','IBAN_CAPTURED','IBAN_VERIFIED',
                          'IDENTITY_VERIFIED','BANK_CONFIRMED','MARKED_READY',
                          'ARTIFACT_GENERATED','SUBMITTED_TO_MUDAD','REJECTED')),
  actor_user_id           UUID REFERENCES users(id),
  actor_type              VARCHAR(16) NOT NULL DEFAULT 'HUMAN'
    CHECK (actor_type IN ('HUMAN','AI','SYSTEM')),
  payload                 JSONB DEFAULT '{}',
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_wps_events_pack   ON wps_readiness_events(wps_readiness_pack_id);
CREATE INDEX IF NOT EXISTS idx_wps_events_tenant ON wps_readiness_events(tenant_id);

-- ── Row-Level Security ──────────────────────────────────────────────────────
ALTER TABLE wps_readiness_packs  ENABLE ROW LEVEL SECURITY;
ALTER TABLE wps_readiness_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_wps_packs ON wps_readiness_packs
  USING (COALESCE(current_setting('app.current_tenant_id', true), '') = ''
    OR tenant_id = current_setting('app.current_tenant_id', true));

CREATE POLICY tenant_isolation_wps_events ON wps_readiness_events
  USING (COALESCE(current_setting('app.current_tenant_id', true), '') = ''
    OR tenant_id = current_setting('app.current_tenant_id', true));

-- ── Grants ──────────────────────────────────────────────────────────────────
GRANT SELECT, INSERT ON wps_readiness_packs TO prowork_app;
GRANT UPDATE (status, iban_masked, iban_hash, iban_verified_at,
              identity_status, identity_verified_at,
              bank_confirmation_status, bank_confirmation_at,
              readiness_score_pct, last_artifact_generated_at, updated_at)
  ON wps_readiness_packs TO prowork_app;

GRANT SELECT, INSERT ON wps_readiness_events TO prowork_app;
-- No UPDATE, no DELETE on events (append-only)

COMMIT;
