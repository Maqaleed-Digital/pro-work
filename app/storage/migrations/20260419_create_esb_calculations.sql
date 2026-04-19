-- S44-G4: ESB calculation tables
-- RLS enforced. Append-only audit spine on esb_calculation_events.

BEGIN;

CREATE TABLE IF NOT EXISTS esb_calculations (
  id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id                   VARCHAR(64) NOT NULL REFERENCES tenants(id),
  contract_id                 UUID NOT NULL REFERENCES contracts(id),
  candidate_id                UUID NOT NULL REFERENCES candidates(id),
  policy_version              TEXT NOT NULL,
  service_start_date          DATE NOT NULL,
  service_end_date            DATE NOT NULL,
  service_years               NUMERIC NOT NULL,
  basic_salary_sar            NUMERIC NOT NULL,
  total_salary_sar            NUMERIC NOT NULL,
  termination_type            VARCHAR(32) NOT NULL
    CHECK (termination_type IN ('RESIGNATION','EMPLOYER_TERMINATION','EXPIRY_OF_FIXED_TERM',
                                'DEATH','DISABILITY','MUTUAL_AGREEMENT')),
  contract_type               VARCHAR(32) NOT NULL
    CHECK (contract_type IN ('FTE_UNLIMITED','FTE_FIXED_TERM')),
  calculation_inputs_json     JSONB NOT NULL,
  calculation_breakdown_json  JSONB NOT NULL,
  final_amount_sar            NUMERIC NOT NULL,
  status                      VARCHAR(16) NOT NULL DEFAULT 'DRAFT'
    CHECK (status IN ('DRAFT','FINALIZED')),
  finalized_at                TIMESTAMPTZ,
  finalized_by                UUID REFERENCES users(id),
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_esb_tenant   ON esb_calculations(tenant_id);
CREATE INDEX IF NOT EXISTS idx_esb_contract ON esb_calculations(contract_id);
CREATE INDEX IF NOT EXISTS idx_esb_status   ON esb_calculations(status);

CREATE TABLE IF NOT EXISTS esb_calculation_events (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             VARCHAR(64) NOT NULL REFERENCES tenants(id),
  esb_calculation_id    UUID NOT NULL REFERENCES esb_calculations(id),
  event_type            VARCHAR(32) NOT NULL
    CHECK (event_type IN ('CALCULATION_DRAFTED','RECALCULATED','FINALIZED','EVIDENCE_ATTACHED')),
  actor_user_id         UUID REFERENCES users(id),
  actor_type            VARCHAR(16) NOT NULL DEFAULT 'HUMAN'
    CHECK (actor_type IN ('HUMAN','AI','SYSTEM')),
  payload               JSONB DEFAULT '{}',
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_esb_events_calc   ON esb_calculation_events(esb_calculation_id);
CREATE INDEX IF NOT EXISTS idx_esb_events_tenant ON esb_calculation_events(tenant_id);

ALTER TABLE esb_calculations       ENABLE ROW LEVEL SECURITY;
ALTER TABLE esb_calculation_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_esb ON esb_calculations
  USING (COALESCE(current_setting('app.current_tenant_id', true), '') = ''
    OR tenant_id = current_setting('app.current_tenant_id', true));

CREATE POLICY tenant_isolation_esb_events ON esb_calculation_events
  USING (COALESCE(current_setting('app.current_tenant_id', true), '') = ''
    OR tenant_id = current_setting('app.current_tenant_id', true));

GRANT SELECT, INSERT ON esb_calculations TO prowork_app;
GRANT UPDATE (status, calculation_inputs_json, calculation_breakdown_json,
              final_amount_sar, termination_type, service_years,
              finalized_at, finalized_by, updated_at)
  ON esb_calculations TO prowork_app;

GRANT SELECT, INSERT ON esb_calculation_events TO prowork_app;

COMMIT;
