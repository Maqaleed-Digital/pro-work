-- S44-G6: SDP Program tables
-- RLS enforced. Append-only audit spine.
-- DELIBERATE ABSENCE: No shift, attendance, clock-in/out, roster, or hourly
-- scheduling columns anywhere. This is by design per Gold BRD §A5 + RT-1 §7.6.
-- SDP programs use delivery windows and outcome criteria, not employment schedules.

BEGIN;

CREATE TABLE IF NOT EXISTS sdp_programs (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id               VARCHAR(64) NOT NULL REFERENCES tenants(id),
  name_en                 TEXT NOT NULL,
  name_ar                 TEXT NOT NULL,
  program_type            VARCHAR(32) NOT NULL
    CHECK (program_type IN ('HAJJ_OPERATIONS','UMRAH_OPERATIONS','SPORTING_EVENT',
                            'GOVERNMENT_SURGE','ENTERPRISE_SURGE','OTHER')),
  start_date              DATE NOT NULL,
  end_date                DATE NOT NULL,
  capacity_roles          INTEGER NOT NULL,
  budget_envelope_sar     NUMERIC NOT NULL,
  compliance_flags_json   JSONB NOT NULL DEFAULT '{}',
  status                  VARCHAR(16) NOT NULL DEFAULT 'DRAFT'
    CHECK (status IN ('DRAFT','APPROVED','ACTIVE','WOUND_DOWN','CLOSED','CANCELLED')),
  approved_at             TIMESTAMPTZ,
  activated_at            TIMESTAMPTZ,
  wound_down_at           TIMESTAMPTZ,
  closed_at               TIMESTAMPTZ,
  approved_by             UUID REFERENCES users(id),
  activated_by            UUID REFERENCES users(id),
  closed_by               UUID REFERENCES users(id),
  cancellation_reason     TEXT,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (end_date > start_date)
);

CREATE INDEX IF NOT EXISTS idx_sdp_programs_tenant ON sdp_programs(tenant_id);
CREATE INDEX IF NOT EXISTS idx_sdp_programs_status ON sdp_programs(status);

CREATE TABLE IF NOT EXISTS sdp_pods (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id               VARCHAR(64) NOT NULL REFERENCES tenants(id),
  program_id              UUID NOT NULL REFERENCES sdp_programs(id),
  template_type           VARCHAR(32) NOT NULL
    CHECK (template_type IN ('EVENT_MEDIA','MULTILINGUAL_SUPPORT','DIGITAL_OPERATIONS',
                             'ANALYTICS_MONITORING','CYBERSECURITY_SOC','CUSTOM')),
  template_version        TEXT,
  name                    TEXT NOT NULL,
  capacity_roles          INTEGER NOT NULL DEFAULT 0,
  roles_filled            INTEGER NOT NULL DEFAULT 0,
  delivery_window_start   DATE NOT NULL,
  delivery_window_end     DATE NOT NULL,
  outcome_criteria_json   JSONB NOT NULL DEFAULT '[]',
  status                  VARCHAR(16) NOT NULL DEFAULT 'PLANNED'
    CHECK (status IN ('PLANNED','ACTIVE','COMPLETED','CANCELLED')),
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sdp_pods_program ON sdp_pods(program_id);
CREATE INDEX IF NOT EXISTS idx_sdp_pods_tenant  ON sdp_pods(tenant_id);

CREATE TABLE IF NOT EXISTS sdp_program_events (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       VARCHAR(64) NOT NULL REFERENCES tenants(id),
  program_id      UUID NOT NULL REFERENCES sdp_programs(id),
  event_type      VARCHAR(32) NOT NULL
    CHECK (event_type IN ('PROGRAM_DRAFTED','PROGRAM_APPROVED','PROGRAM_ACTIVATED',
                          'POD_INSTANTIATED','POD_COMPLETED','PROGRAM_WOUND_DOWN',
                          'PROGRAM_CLOSED','PROGRAM_CANCELLED','COMPLIANCE_FLAG_CHANGED')),
  actor_user_id   UUID REFERENCES users(id),
  actor_type      VARCHAR(16) NOT NULL DEFAULT 'HUMAN'
    CHECK (actor_type IN ('HUMAN','AI','SYSTEM')),
  payload         JSONB DEFAULT '{}',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sdp_events_program ON sdp_program_events(program_id);
CREATE INDEX IF NOT EXISTS idx_sdp_events_tenant  ON sdp_program_events(tenant_id);

ALTER TABLE sdp_programs       ENABLE ROW LEVEL SECURITY;
ALTER TABLE sdp_pods           ENABLE ROW LEVEL SECURITY;
ALTER TABLE sdp_program_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_sdp_programs ON sdp_programs
  USING (COALESCE(current_setting('app.current_tenant_id', true), '') = '' OR tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY tenant_isolation_sdp_pods ON sdp_pods
  USING (COALESCE(current_setting('app.current_tenant_id', true), '') = '' OR tenant_id = current_setting('app.current_tenant_id', true));
CREATE POLICY tenant_isolation_sdp_events ON sdp_program_events
  USING (COALESCE(current_setting('app.current_tenant_id', true), '') = '' OR tenant_id = current_setting('app.current_tenant_id', true));

GRANT SELECT, INSERT ON sdp_programs TO prowork_app;
GRANT UPDATE (status, approved_at, activated_at, wound_down_at, closed_at,
              approved_by, activated_by, closed_by, cancellation_reason,
              capacity_roles, budget_envelope_sar, compliance_flags_json, end_date, updated_at)
  ON sdp_programs TO prowork_app;

GRANT SELECT, INSERT ON sdp_pods TO prowork_app;
GRANT UPDATE (status, roles_filled, capacity_roles, outcome_criteria_json, delivery_window_end, updated_at)
  ON sdp_pods TO prowork_app;

GRANT SELECT, INSERT ON sdp_program_events TO prowork_app;

COMMIT;
