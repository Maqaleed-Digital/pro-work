BEGIN;

-- WPS Readiness Records: stores pack metadata.
-- CRITICAL: raw IBAN is NEVER stored — iban_hash (SHA-256) only.
CREATE TABLE IF NOT EXISTS wps_readiness_records (
  pack_id                       UUID        PRIMARY KEY,
  tenant_id                     UUID        NOT NULL,
  worker_id                     UUID        NOT NULL,
  onboarding_case_id            UUID        NOT NULL,
  iban_hash                     TEXT        NOT NULL,   -- SHA-256 of normalised IBAN; raw IBAN never stored
  bank_code                     TEXT,
  bank_name                     TEXT,
  iban_status                   TEXT        NOT NULL DEFAULT 'PENDING'  CHECK (iban_status IN ('VERIFIED','PENDING','FAILED')),
  identity_verification_status  TEXT        NOT NULL DEFAULT 'PENDING'  CHECK (identity_verification_status IN ('VERIFIED','PENDING','FAILED')),
  bank_confirmation_status      TEXT        NOT NULL DEFAULT 'PENDING'  CHECK (bank_confirmation_status IN ('CONFIRMED','PENDING','FAILED')),
  wps_package                   JSONB       NOT NULL DEFAULT '{}'::jsonb,
  evidence_pack_id              TEXT,
  policy_version                TEXT        NOT NULL DEFAULT 'v1',
  generated_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for tenant isolation queries
CREATE INDEX IF NOT EXISTS wps_readiness_records_tenant_worker
  ON wps_readiness_records (tenant_id, worker_id);

-- Evidence packs for EP-WOS-ONBOARD-01 (append-only: no UPDATE/DELETE)
CREATE TABLE IF NOT EXISTS wps_evidence_packs (
  evidence_pack_id   TEXT        PRIMARY KEY,
  evidence_pack_ref  TEXT        NOT NULL DEFAULT 'EP-WOS-ONBOARD-01',
  version            TEXT        NOT NULL DEFAULT 'v1',
  tenant_id          UUID        NOT NULL,
  worker_id          UUID        NOT NULL,
  onboarding_case_id UUID        NOT NULL,
  steps              JSONB       NOT NULL DEFAULT '[]'::jsonb,
  required_steps     JSONB       NOT NULL DEFAULT '[]'::jsonb,
  missing_steps      JSONB       NOT NULL DEFAULT '[]'::jsonb,
  complete           BOOLEAN     NOT NULL DEFAULT FALSE,
  generated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Row-level security: tenant isolation
ALTER TABLE wps_readiness_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE wps_evidence_packs    ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'prowork_app') THEN
    -- App role may read/insert readiness records; no update (idempotent upsert handled at app layer)
    GRANT SELECT, INSERT ON wps_readiness_records TO prowork_app;
    GRANT SELECT, INSERT ON wps_evidence_packs    TO prowork_app;
    -- Enforce append-only on evidence packs at DB level
    REVOKE UPDATE, DELETE ON wps_evidence_packs FROM prowork_app;
  END IF;
END
$$;

COMMIT;
