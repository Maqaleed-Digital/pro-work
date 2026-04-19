-- S44-G5: Offboarding workflow tables
-- RLS enforced. Append-only audit spine.

BEGIN;

CREATE TABLE IF NOT EXISTS offboardings (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id               VARCHAR(64) NOT NULL REFERENCES tenants(id),
  contract_id             UUID NOT NULL REFERENCES contracts(id),
  candidate_id            UUID NOT NULL REFERENCES candidates(id),
  wps_readiness_pack_id   UUID,
  probation_record_id     UUID,
  esb_calculation_id      UUID,
  evidence_pack_id        UUID,
  status                  VARCHAR(32) NOT NULL DEFAULT 'INITIATED'
    CHECK (status IN ('INITIATED','HANDOVER','SETTLEMENT_PENDING',
                      'APPROVALS_PENDING','READY_TO_FINALIZE','FINALIZED','CANCELLED')),
  reason_type             VARCHAR(32) NOT NULL
    CHECK (reason_type IN ('RESIGNATION','EMPLOYER_TERMINATION','EXPIRY_OF_FIXED_TERM',
                           'DEATH','DISABILITY','MUTUAL_AGREEMENT','PROBATION_TERMINATION')),
  reason_text             TEXT NOT NULL,
  notice_period_days      INTEGER,
  notice_served_from      DATE,
  notice_served_until     DATE,
  last_working_day        DATE,
  checklist_state_json    JSONB NOT NULL DEFAULT '{}',
  approvals_json          JSONB NOT NULL DEFAULT '{}',
  cancelled_reason        TEXT,
  finalized_at            TIMESTAMPTZ,
  finalized_by            UUID REFERENCES users(id),
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_offboarding_tenant   ON offboardings(tenant_id);
CREATE INDEX IF NOT EXISTS idx_offboarding_contract ON offboardings(contract_id);
CREATE INDEX IF NOT EXISTS idx_offboarding_status   ON offboardings(status);

CREATE TABLE IF NOT EXISTS offboarding_events (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         VARCHAR(64) NOT NULL REFERENCES tenants(id),
  offboarding_id    UUID NOT NULL REFERENCES offboardings(id),
  event_type        VARCHAR(32) NOT NULL
    CHECK (event_type IN ('OFFBOARDING_INITIATED','CHECKLIST_ITEM_COMPLETED',
                          'APPROVAL_RECORDED','ESB_LINKED','READY_FLAGGED',
                          'FINALIZED','CANCELLED','EVIDENCE_PACK_GENERATED')),
  previous_status   VARCHAR(32),
  new_status        VARCHAR(32),
  actor_user_id     UUID REFERENCES users(id),
  actor_type        VARCHAR(16) NOT NULL DEFAULT 'HUMAN'
    CHECK (actor_type IN ('HUMAN','AI','SYSTEM')),
  payload           JSONB DEFAULT '{}',
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_offb_events_offboarding ON offboarding_events(offboarding_id);
CREATE INDEX IF NOT EXISTS idx_offb_events_tenant      ON offboarding_events(tenant_id);

ALTER TABLE offboardings       ENABLE ROW LEVEL SECURITY;
ALTER TABLE offboarding_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_offboardings ON offboardings
  USING (COALESCE(current_setting('app.current_tenant_id', true), '') = ''
    OR tenant_id = current_setting('app.current_tenant_id', true));

CREATE POLICY tenant_isolation_offb_events ON offboarding_events
  USING (COALESCE(current_setting('app.current_tenant_id', true), '') = ''
    OR tenant_id = current_setting('app.current_tenant_id', true));

GRANT SELECT, INSERT ON offboardings TO prowork_app;
GRANT UPDATE (status, checklist_state_json, approvals_json, esb_calculation_id,
              evidence_pack_id, cancelled_reason, finalized_at, finalized_by,
              notice_served_until, last_working_day, updated_at)
  ON offboardings TO prowork_app;

GRANT SELECT, INSERT ON offboarding_events TO prowork_app;

COMMIT;
