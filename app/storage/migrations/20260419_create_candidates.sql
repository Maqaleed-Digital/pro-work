-- S43-G3: Candidate pipeline tables — candidates, applications, application_events
-- RLS enforced. Append-only audit spine on application_events.

BEGIN;

-- ── candidates ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS candidates (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     VARCHAR(64)  NOT NULL REFERENCES tenants(id),
  first_name    VARCHAR(128) NOT NULL,
  last_name     VARCHAR(128) NOT NULL,
  email         VARCHAR(255) NOT NULL,
  nationality   VARCHAR(8),
  phone         VARCHAR(32),
  linkedin_url  TEXT,
  eri_score     NUMERIC,
  source        VARCHAR(32) NOT NULL DEFAULT 'DIRECT'
    CHECK (source IN ('DIRECT', 'REFERRAL', 'AI_MATCH', 'BULK_IMPORT')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, email)
);

CREATE INDEX IF NOT EXISTS idx_candidates_tenant ON candidates(tenant_id);
CREATE INDEX IF NOT EXISTS idx_candidates_email  ON candidates(email);

-- ── applications ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS applications (
  id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id                   VARCHAR(64) NOT NULL REFERENCES tenants(id),
  candidate_id                UUID NOT NULL REFERENCES candidates(id),
  requisition_id              UUID NOT NULL REFERENCES requisitions(id),
  status                      VARCHAR(32) NOT NULL DEFAULT 'APPLIED'
    CHECK (status IN ('APPLIED','SCREENING','SHORTLISTED','INTERVIEWED',
                      'OFFERED','HIRED','REJECTED','WITHDRAWN')),
  rejection_reason            TEXT,
  match_score                 NUMERIC,
  match_confidence            NUMERIC,
  ai_recommendation_log_id    UUID,  -- logical FK to recommendation_audit_logs(id)
  applied_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, candidate_id, requisition_id)
);

CREATE INDEX IF NOT EXISTS idx_applications_tenant      ON applications(tenant_id);
CREATE INDEX IF NOT EXISTS idx_applications_requisition ON applications(requisition_id);
CREATE INDEX IF NOT EXISTS idx_applications_candidate   ON applications(candidate_id);
CREATE INDEX IF NOT EXISTS idx_applications_status      ON applications(status);

-- ── application_events (audit spine — append-only) ──────────────────────────
CREATE TABLE IF NOT EXISTS application_events (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        VARCHAR(64) NOT NULL REFERENCES tenants(id),
  application_id   UUID NOT NULL REFERENCES applications(id),
  event_type       VARCHAR(32) NOT NULL
    CHECK (event_type IN ('STATUS_CHANGED','NOTE_ADDED','DOCUMENT_ATTACHED',
                          'INTERVIEW_SCHEDULED','OFFER_SENT','EVIDENCE_GENERATED')),
  previous_status  VARCHAR(32),
  new_status       VARCHAR(32),
  actor_user_id    UUID REFERENCES users(id),
  actor_type       VARCHAR(16) NOT NULL DEFAULT 'HUMAN'
    CHECK (actor_type IN ('HUMAN','AI','SYSTEM')),
  payload          JSONB DEFAULT '{}',
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_app_events_application ON application_events(application_id);
CREATE INDEX IF NOT EXISTS idx_app_events_tenant      ON application_events(tenant_id);
CREATE INDEX IF NOT EXISTS idx_app_events_type        ON application_events(event_type);

-- ── Row-Level Security ──────────────────────────────────────────────────────
ALTER TABLE candidates         ENABLE ROW LEVEL SECURITY;
ALTER TABLE applications       ENABLE ROW LEVEL SECURITY;
ALTER TABLE application_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_candidates ON candidates
  USING (
    COALESCE(current_setting('app.current_tenant_id', true), '') = ''
    OR tenant_id = current_setting('app.current_tenant_id', true)
  );

CREATE POLICY tenant_isolation_applications ON applications
  USING (
    COALESCE(current_setting('app.current_tenant_id', true), '') = ''
    OR tenant_id = current_setting('app.current_tenant_id', true)
  );

CREATE POLICY tenant_isolation_app_events ON application_events
  USING (
    COALESCE(current_setting('app.current_tenant_id', true), '') = ''
    OR tenant_id = current_setting('app.current_tenant_id', true)
  );

-- ── Grants ──────────────────────────────────────────────────────────────────

-- candidates: INSERT + SELECT + column-level UPDATE (eri_score, updated_at)
GRANT SELECT, INSERT ON candidates TO prowork_app;
GRANT UPDATE (eri_score, updated_at) ON candidates TO prowork_app;

-- applications: INSERT + SELECT + column-level UPDATE
GRANT SELECT, INSERT ON applications TO prowork_app;
GRANT UPDATE (status, rejection_reason, match_score, match_confidence,
              ai_recommendation_log_id, updated_at) ON applications TO prowork_app;

-- application_events: INSERT + SELECT only (append-only audit spine)
GRANT SELECT, INSERT ON application_events TO prowork_app;
-- No UPDATE, no DELETE — immutable audit trail

COMMIT;
