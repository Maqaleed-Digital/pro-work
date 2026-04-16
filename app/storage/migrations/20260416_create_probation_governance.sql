BEGIN;

-- Probation governance records — full lifecycle with decision tracking.
-- Separate from probation_cases (sprint C migration) to avoid schema conflict.
CREATE TABLE IF NOT EXISTS probation_governance_records (
  governance_case_id        UUID        PRIMARY KEY,
  worker_id                 UUID        NOT NULL,
  tenant_id                 UUID        NOT NULL,
  onboarding_case_id        UUID        NOT NULL,
  period_days               INTEGER     NOT NULL DEFAULT 90,
  started_at                TIMESTAMPTZ NOT NULL,
  max_end_date              TIMESTAMPTZ NOT NULL,     -- start + 180 days absolute ceiling
  status                    TEXT        NOT NULL DEFAULT 'ACTIVE'
    CHECK (status IN ('ACTIVE','CONFIRMED','TERMINATED','EXTENDED')),
  decision_status           TEXT        NOT NULL DEFAULT 'PENDING'
    CHECK (decision_status IN ('PENDING','CONFIRM','EXTEND','TERMINATE')),
  decision                  TEXT,
  decision_made_by          UUID,
  decision_at               TIMESTAMPTZ,
  reason_code               TEXT,
  extension_days            INTEGER     NOT NULL DEFAULT 0,
  termination_reason_code   TEXT,
  notice_details            JSONB,
  settlement_checklist      JSONB,
  evidence_signals          JSONB       NOT NULL DEFAULT '{}'::jsonb,
  evidence_pack_id          TEXT,
  evidence_pack_compiled_at TIMESTAMPTZ,
  policy_version            TEXT        NOT NULL DEFAULT 'v1',
  created_at                TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for deadline alert queries (tenant + end date)
CREATE INDEX IF NOT EXISTS probation_governance_tenant_end
  ON probation_governance_records (tenant_id, max_end_date);

-- Index for day-80 automation queries (active cases without compiled pack)
CREATE INDEX IF NOT EXISTS probation_governance_day80
  ON probation_governance_records (tenant_id, started_at)
  WHERE status = 'ACTIVE' AND evidence_pack_compiled_at IS NULL;

ALTER TABLE probation_governance_records ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'prowork_app') THEN
    GRANT SELECT, INSERT, UPDATE ON probation_governance_records TO prowork_app;
    -- Decisions are recorded via UPDATE; only restrict direct DELETE
    REVOKE DELETE ON probation_governance_records FROM prowork_app;
  END IF;
END
$$;

COMMIT;
