-- S43-G6: Offers table — hiring offers with compliance preview
-- RLS enforced. Append-only (no DELETE).

BEGIN;

CREATE TABLE IF NOT EXISTS offers (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id               VARCHAR(64)  NOT NULL REFERENCES tenants(id),
  application_id          UUID         NOT NULL REFERENCES applications(id),
  candidate_id            UUID         NOT NULL REFERENCES candidates(id),
  requisition_id          UUID         NOT NULL REFERENCES requisitions(id),
  offer_type              VARCHAR(32)  NOT NULL
    CHECK (offer_type IN ('FTE', 'FREELANCER', 'AI_EXECUTABLE')),
  payload                 JSONB        NOT NULL DEFAULT '{}',
  status                  VARCHAR(32)  NOT NULL DEFAULT 'DRAFT'
    CHECK (status IN ('DRAFT', 'SENT', 'ACCEPTED', 'REJECTED', 'EXPIRED', 'WITHDRAWN')),
  compliance_preview_json JSONB,
  compliance_overridden   BOOLEAN      NOT NULL DEFAULT FALSE,
  override_reason         TEXT,
  sent_at                 TIMESTAMPTZ,
  created_at              TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_offers_tenant      ON offers(tenant_id);
CREATE INDEX IF NOT EXISTS idx_offers_application ON offers(application_id);
CREATE INDEX IF NOT EXISTS idx_offers_status      ON offers(status);

ALTER TABLE offers ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_offers ON offers
  USING (
    COALESCE(current_setting('app.current_tenant_id', true), '') = ''
    OR tenant_id = current_setting('app.current_tenant_id', true)
  );

GRANT SELECT, INSERT ON offers TO prowork_app;
GRANT UPDATE (status, sent_at, compliance_preview_json, compliance_overridden, override_reason, updated_at, payload) ON offers TO prowork_app;

COMMIT;
