-- S43-G1: Requisition tables — hiring pipeline foundation
-- RLS enforced. Append-only (no DELETE for prowork_app).

BEGIN;

-- ── requisitions ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS requisitions (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id               VARCHAR(64)  NOT NULL REFERENCES tenants(id),
  created_by              UUID         NOT NULL REFERENCES users(id),
  title                   VARCHAR(255) NOT NULL,
  department              VARCHAR(128),
  contract_type           VARCHAR(32)  NOT NULL
    CHECK (contract_type IN ('FTE', 'FREELANCER', 'AI_EXECUTABLE')),
  occupation_code         VARCHAR(32),
  target_nationality      VARCHAR(8),
  salary_min              DECIMAL(12,2),
  salary_max              DECIMAL(12,2),
  description             TEXT,
  requirements            JSONB DEFAULT '{}',
  status                  VARCHAR(32) NOT NULL DEFAULT 'DRAFT'
    CHECK (status IN ('DRAFT', 'NITAQAT_PREVIEWED', 'PUBLISHED', 'CLOSED', 'FILLED')),
  nitaqat_preview_run_at  TIMESTAMPTZ,
  nitaqat_preview_result  JSONB,
  published_at            TIMESTAMPTZ,
  filled_at               TIMESTAMPTZ,
  closed_reason           TEXT,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_requisitions_tenant   ON requisitions(tenant_id);
CREATE INDEX IF NOT EXISTS idx_requisitions_status   ON requisitions(status);
CREATE INDEX IF NOT EXISTS idx_requisitions_created  ON requisitions(created_at DESC);

-- ── requisition_skills ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS requisition_skills (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  requisition_id  UUID NOT NULL REFERENCES requisitions(id) ON DELETE CASCADE,
  skill_name      VARCHAR(128) NOT NULL,
  proficiency     VARCHAR(32) DEFAULT 'REQUIRED'
    CHECK (proficiency IN ('REQUIRED', 'PREFERRED', 'NICE_TO_HAVE')),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_req_skills_requisition ON requisition_skills(requisition_id);

-- ── requisition_documents ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS requisition_documents (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  requisition_id  UUID NOT NULL REFERENCES requisitions(id) ON DELETE CASCADE,
  document_type   VARCHAR(64) NOT NULL,
  file_name       VARCHAR(255),
  file_url        TEXT,
  uploaded_by     UUID REFERENCES users(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_req_docs_requisition ON requisition_documents(requisition_id);

-- ── Row-Level Security ──────────────────────────────────────────────────────
ALTER TABLE requisitions          ENABLE ROW LEVEL SECURITY;
ALTER TABLE requisition_skills    ENABLE ROW LEVEL SECURITY;
ALTER TABLE requisition_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_requisitions ON requisitions
  USING (
    COALESCE(current_setting('app.current_tenant_id', true), '') = ''
    OR tenant_id = current_setting('app.current_tenant_id', true)
  );

CREATE POLICY tenant_isolation_req_skills ON requisition_skills
  USING (
    requisition_id IN (
      SELECT id FROM requisitions
      WHERE COALESCE(current_setting('app.current_tenant_id', true), '') = ''
        OR tenant_id = current_setting('app.current_tenant_id', true)
    )
  );

CREATE POLICY tenant_isolation_req_docs ON requisition_documents
  USING (
    requisition_id IN (
      SELECT id FROM requisitions
      WHERE COALESCE(current_setting('app.current_tenant_id', true), '') = ''
        OR tenant_id = current_setting('app.current_tenant_id', true)
    )
  );

-- ── Grants — append-only pattern ────────────────────────────────────────────
GRANT SELECT, INSERT ON requisitions TO prowork_app;
GRANT UPDATE (status, filled_at, nitaqat_preview_run_at, nitaqat_preview_result, published_at, closed_reason, updated_at) ON requisitions TO prowork_app;

GRANT SELECT, INSERT ON requisition_skills    TO prowork_app;
GRANT SELECT, INSERT ON requisition_documents TO prowork_app;

-- No DELETE granted — append-only enforced at DB level

COMMIT;
