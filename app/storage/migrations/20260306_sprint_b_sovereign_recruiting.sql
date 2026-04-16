-- ============================================================================
-- Sprint B: Sovereign Recruiting (BRD V3 Final)
-- Target: PostgreSQL 14+
-- Run after: 20260306_sprint_a_wos_core.sql
-- ============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS candidates (
  candidate_id          UUID        PRIMARY KEY,
  tenant_id             UUID        NOT NULL,
  candidate_type        TEXT        NOT NULL CHECK (candidate_type IN ('FTE', 'FREELANCER')),
  full_name             TEXT        NOT NULL,
  email                 TEXT,
  phone                 TEXT,
  nationality_code      TEXT        NOT NULL,
  current_status        TEXT        NOT NULL,
  availability_status   TEXT        NOT NULL,
  years_experience      INTEGER     NOT NULL DEFAULT 0,
  preferred_role_family TEXT,
  created_at            TIMESTAMPTZ NOT NULL,
  updated_at            TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS candidate_skills (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id UUID NOT NULL REFERENCES candidates(candidate_id) ON DELETE CASCADE,
  skill_name   TEXT NOT NULL,
  proficiency_level TEXT,
  UNIQUE (candidate_id, skill_name)
);

CREATE TABLE IF NOT EXISTS requisitions (
  requisition_id            UUID        PRIMARY KEY,
  tenant_id                 UUID        NOT NULL,
  establishment_id          UUID        NOT NULL,
  title                     TEXT        NOT NULL,
  role_family               TEXT        NOT NULL,
  contract_type             TEXT        NOT NULL,
  employment_type           TEXT        NOT NULL,
  minimum_years_experience  INTEGER     NOT NULL DEFAULT 0,
  status                    TEXT        NOT NULL,
  internal_first            BOOLEAN     NOT NULL DEFAULT TRUE,
  occupation_code_target    TEXT,
  hiring_manager_id         UUID        NOT NULL,
  created_at                TIMESTAMPTZ NOT NULL,
  updated_at                TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS requisition_required_skills (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  requisition_id UUID NOT NULL REFERENCES requisitions(requisition_id) ON DELETE CASCADE,
  skill_name     TEXT NOT NULL,
  UNIQUE (requisition_id, skill_name)
);

CREATE TABLE IF NOT EXISTS candidate_matches (
  id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             UUID        NOT NULL,
  requisition_id        UUID        NOT NULL REFERENCES requisitions(requisition_id) ON DELETE CASCADE,
  candidate_id          UUID        NOT NULL REFERENCES candidates(candidate_id) ON DELETE CASCADE,
  final_score           NUMERIC(8,4) NOT NULL,
  ranking_reason        JSONB       NOT NULL,
  missing_skills        JSONB       NOT NULL,
  nitaqat_preview       JSONB       NOT NULL,
  occupation_validation JSONB       NOT NULL,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS candidate_shortlists (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        UUID        NOT NULL,
  requisition_id   UUID        NOT NULL REFERENCES requisitions(requisition_id) ON DELETE CASCADE,
  candidate_id     UUID        NOT NULL REFERENCES candidates(candidate_id) ON DELETE CASCADE,
  shortlist_reason TEXT        NOT NULL,
  reviewer_outcome TEXT        NOT NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS recruiting_ai_decisions (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        UUID        NOT NULL,
  requisition_id   UUID        NOT NULL REFERENCES requisitions(requisition_id) ON DELETE CASCADE,
  candidate_id     UUID        NOT NULL REFERENCES candidates(candidate_id) ON DELETE CASCADE,
  decision_type    TEXT        NOT NULL,
  model_version    TEXT,
  prompt_ref       TEXT,
  context_refs     JSONB       NOT NULL DEFAULT '[]'::jsonb,
  output_payload   JSONB       NOT NULL,
  reviewer_outcome TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMIT;
