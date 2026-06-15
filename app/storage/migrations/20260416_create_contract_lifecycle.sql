BEGIN;

-- Contract lifecycle events: immutable append-only log.
-- No UPDATE or DELETE ever permitted on this table.
CREATE TABLE IF NOT EXISTS contract_lifecycle_events (
  event_id               UUID        PRIMARY KEY,
  contract_id            UUID        NOT NULL,
  tenant_id              UUID        NOT NULL,
  from_state             TEXT,                            -- NULL for initial DRAFT creation
  to_state               TEXT        NOT NULL,
  actor_type             TEXT        NOT NULL DEFAULT 'HUMAN',
  actor_id               UUID        NOT NULL,
  reason                 TEXT,
  evidence               JSONB       NOT NULL DEFAULT '{}'::jsonb,
  qiwa_payload_snapshot  JSONB       NOT NULL DEFAULT '{}'::jsonb,
  occurred_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Fast lookup: all events for a contract in chronological order
CREATE INDEX IF NOT EXISTS contract_lifecycle_events_contract_id
  ON contract_lifecycle_events (contract_id, occurred_at);

-- Tenant isolation index
CREATE INDEX IF NOT EXISTS contract_lifecycle_events_tenant
  ON contract_lifecycle_events (tenant_id);

-- Contract state tracking table (current state only; events are in lifecycle_events)
CREATE TABLE IF NOT EXISTS qiwa_contracts (
  contract_id               UUID        PRIMARY KEY,
  tenant_id                 UUID        NOT NULL,
  worker_id                 UUID        NOT NULL,
  onboarding_case_id        UUID,
  role_title                TEXT,
  wage_base                 NUMERIC(12,2),
  housing_allowance         NUMERIC(12,2),
  transport_allowance       NUMERIC(12,2),
  other_allowances          NUMERIC(12,2),
  probation_days            INTEGER     NOT NULL DEFAULT 90,
  notice_days               INTEGER     NOT NULL DEFAULT 30,
  contract_duration_months  INTEGER,
  work_location             TEXT,
  worker_national_id        TEXT,
  employer_cr_number        TEXT,
  contract_start_date       DATE,
  contract_end_date         DATE,
  working_hours_per_week    INTEGER,
  occupation_code           TEXT,
  nationality               TEXT,
  status                    TEXT        NOT NULL DEFAULT 'DRAFT'
    CHECK (status IN ('DRAFT','REVIEW','SIGNED','ACTIVATED','AMENDED','TERMINATED')),
  activation_date           DATE,
  amendment_reason          TEXT,
  amended_fields            JSONB,
  termination_code          TEXT,
  notice_details            JSONB,
  terminated_at             TIMESTAMPTZ,
  qiwa_mapping_version      TEXT        NOT NULL DEFAULT 'v1',
  created_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS qiwa_contracts_tenant_worker
  ON qiwa_contracts (tenant_id, worker_id);

-- Row-level security: tenant isolation
ALTER TABLE contract_lifecycle_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE qiwa_contracts            ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'prowork_app') THEN
    GRANT SELECT, INSERT ON contract_lifecycle_events TO prowork_app;
    -- Immutable: explicitly block UPDATE and DELETE forever
    REVOKE UPDATE, DELETE ON contract_lifecycle_events FROM prowork_app;

    GRANT SELECT, INSERT, UPDATE ON qiwa_contracts TO prowork_app;
    REVOKE DELETE ON qiwa_contracts FROM prowork_app;
  END IF;
END
$$;

COMMIT;
