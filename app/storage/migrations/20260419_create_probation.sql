-- S44-G3: Probation governance tables
-- RLS enforced. Append-only audit spine on probation_events.

BEGIN;

CREATE TABLE IF NOT EXISTS probation_records (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id                 VARCHAR(64) NOT NULL REFERENCES tenants(id),
  contract_id               UUID NOT NULL REFERENCES contracts(id),
  candidate_id              UUID NOT NULL REFERENCES candidates(id),
  start_date                DATE NOT NULL,
  planned_end_date          DATE NOT NULL,
  actual_end_date           DATE,
  status                    VARCHAR(32) NOT NULL DEFAULT 'ACTIVE'
    CHECK (status IN ('ACTIVE','EVIDENCE_PACK_READY','AWAITING_DECISION',
                      'CONFIRMED','EXTENDED','TERMINATED','EXPIRED')),
  probation_days            INTEGER NOT NULL DEFAULT 90,
  extension_days            INTEGER NOT NULL DEFAULT 0,
  day_80_evidence_pack_id   UUID,
  decision                  VARCHAR(16)
    CHECK (decision IS NULL OR decision IN ('CONFIRM','EXTEND','TERMINATE')),
  decision_reason           TEXT,
  decision_made_at          TIMESTAMPTZ,
  decision_made_by          UUID REFERENCES users(id),
  created_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_probation_tenant ON probation_records(tenant_id);
CREATE INDEX IF NOT EXISTS idx_probation_contract ON probation_records(contract_id);
CREATE INDEX IF NOT EXISTS idx_probation_status_date ON probation_records(status, planned_end_date);

CREATE TABLE IF NOT EXISTS probation_events (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             VARCHAR(64) NOT NULL REFERENCES tenants(id),
  probation_record_id   UUID NOT NULL REFERENCES probation_records(id),
  event_type            VARCHAR(32) NOT NULL
    CHECK (event_type IN ('PROBATION_STARTED','DAY_80_TRIGGERED','EVIDENCE_COMPILED',
                          'DECISION_REQUESTED','CONFIRMED','EXTENDED','TERMINATED',
                          'EXPIRED_WITHOUT_DECISION')),
  previous_status       VARCHAR(32),
  new_status            VARCHAR(32),
  actor_user_id         UUID REFERENCES users(id),
  actor_type            VARCHAR(16) NOT NULL DEFAULT 'HUMAN'
    CHECK (actor_type IN ('HUMAN','AI','SYSTEM')),
  payload               JSONB DEFAULT '{}',
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_probation_events_record ON probation_events(probation_record_id);
CREATE INDEX IF NOT EXISTS idx_probation_events_tenant ON probation_events(tenant_id);

ALTER TABLE probation_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE probation_events  ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_probation ON probation_records
  USING (COALESCE(current_setting('app.current_tenant_id', true), '') = ''
    OR tenant_id = current_setting('app.current_tenant_id', true));

CREATE POLICY tenant_isolation_probation_events ON probation_events
  USING (COALESCE(current_setting('app.current_tenant_id', true), '') = ''
    OR tenant_id = current_setting('app.current_tenant_id', true));

GRANT SELECT, INSERT ON probation_records TO prowork_app;
GRANT UPDATE (status, planned_end_date, actual_end_date, extension_days,
              day_80_evidence_pack_id, decision, decision_reason,
              decision_made_at, decision_made_by, updated_at)
  ON probation_records TO prowork_app;

GRANT SELECT, INSERT ON probation_events TO prowork_app;

COMMIT;
