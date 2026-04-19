-- S45-G1: Seeker profile tables
-- RLS enforced. Append-only audit spine.
-- NON-EMPLOYMENT SAFEGUARD: No shift, attendance, clock-in/out, hours_per_day
-- columns anywhere. Seekers have availability_hours_per_week (capacity signal,
-- NOT a schedule commitment) and timezone_offset_minutes (for overlap matching).

BEGIN;

CREATE TABLE IF NOT EXISTS seeker_profiles (
  id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                     UUID NOT NULL REFERENCES users(id) UNIQUE,
  email                       TEXT NOT NULL,
  full_name_en                TEXT NOT NULL,
  full_name_ar                TEXT NOT NULL,
  nationality                 VARCHAR(8),
  residency_country           VARCHAR(8),
  residency_city              TEXT,
  date_of_birth               DATE,
  gender                      TEXT,
  work_permit_status          VARCHAR(32) DEFAULT 'UNKNOWN'
    CHECK (work_permit_status IN ('CITIZEN','RESIDENT_PERMIT','WORK_VISA',
                                  'DIGITAL_NOMAD_VISA','NONE','UNKNOWN')),
  primary_persona             VARCHAR(16) NOT NULL DEFAULT 'FREELANCER'
    CHECK (primary_persona IN ('FREELANCER','FTE_SEEKER','BOTH')),
  eri_score                   NUMERIC,
  eri_last_computed_at        TIMESTAMPTZ,
  availability_hours_per_week INTEGER,
  timezone_offset_minutes     INTEGER,
  preferred_language_codes    TEXT[] DEFAULT '{}',
  profile_completion_pct      INTEGER NOT NULL DEFAULT 0,
  status                      VARCHAR(16) NOT NULL DEFAULT 'INCOMPLETE'
    CHECK (status IN ('INCOMPLETE','ACTIVE','SUSPENDED','ARCHIVED')),
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_seeker_profiles_user   ON seeker_profiles(user_id);
CREATE INDEX IF NOT EXISTS idx_seeker_profiles_status ON seeker_profiles(status);

CREATE TABLE IF NOT EXISTS seeker_skills (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  seeker_profile_id     UUID NOT NULL REFERENCES seeker_profiles(id),
  skill_key             TEXT NOT NULL,
  proficiency           VARCHAR(16) NOT NULL DEFAULT 'INTERMEDIATE'
    CHECK (proficiency IN ('NOVICE','INTERMEDIATE','ADVANCED','EXPERT')),
  years_of_experience   NUMERIC,
  verified              BOOLEAN NOT NULL DEFAULT FALSE,
  verification_source   TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_seeker_skills_profile ON seeker_skills(seeker_profile_id);

CREATE TABLE IF NOT EXISTS seeker_certifications (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  seeker_profile_id     UUID NOT NULL REFERENCES seeker_profiles(id),
  cert_name             TEXT NOT NULL,
  issuer                TEXT,
  issued_date           DATE,
  expires_date          DATE,
  verification_status   VARCHAR(16) NOT NULL DEFAULT 'UNVERIFIED'
    CHECK (verification_status IN ('UNVERIFIED','PENDING','VERIFIED','EXPIRED','REJECTED')),
  document_ref          TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_seeker_certs_profile ON seeker_certifications(seeker_profile_id);

CREATE TABLE IF NOT EXISTS seeker_profile_events (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  seeker_profile_id     UUID NOT NULL REFERENCES seeker_profiles(id),
  event_type            VARCHAR(32) NOT NULL
    CHECK (event_type IN ('PROFILE_CREATED','PROFILE_UPDATED','ERI_COMPUTED',
                          'SKILL_ADDED','SKILL_VERIFIED','CERTIFICATION_ADDED',
                          'CERTIFICATION_VERIFIED','STATUS_CHANGED')),
  actor_user_id         UUID REFERENCES users(id),
  actor_type            VARCHAR(16) NOT NULL DEFAULT 'HUMAN'
    CHECK (actor_type IN ('HUMAN','AI','SYSTEM')),
  payload               JSONB DEFAULT '{}',
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_seeker_events_profile ON seeker_profile_events(seeker_profile_id);

ALTER TABLE seeker_profiles       ENABLE ROW LEVEL SECURITY;
ALTER TABLE seeker_skills         ENABLE ROW LEVEL SECURITY;
ALTER TABLE seeker_certifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE seeker_profile_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY seeker_own_profile ON seeker_profiles
  USING (COALESCE(current_setting('app.current_tenant_id', true), '') = ''
    OR user_id::text = current_setting('app.current_user_id', true));

CREATE POLICY seeker_own_skills ON seeker_skills
  USING (seeker_profile_id IN (SELECT id FROM seeker_profiles
    WHERE COALESCE(current_setting('app.current_tenant_id', true), '') = ''
      OR user_id::text = current_setting('app.current_user_id', true)));

CREATE POLICY seeker_own_certs ON seeker_certifications
  USING (seeker_profile_id IN (SELECT id FROM seeker_profiles
    WHERE COALESCE(current_setting('app.current_tenant_id', true), '') = ''
      OR user_id::text = current_setting('app.current_user_id', true)));

CREATE POLICY seeker_own_events ON seeker_profile_events
  USING (seeker_profile_id IN (SELECT id FROM seeker_profiles
    WHERE COALESCE(current_setting('app.current_tenant_id', true), '') = ''
      OR user_id::text = current_setting('app.current_user_id', true)));

GRANT SELECT, INSERT ON seeker_profiles TO prowork_app;
GRANT UPDATE (full_name_en, full_name_ar, nationality, residency_country, residency_city,
              date_of_birth, gender, work_permit_status, primary_persona,
              availability_hours_per_week, timezone_offset_minutes,
              preferred_language_codes, profile_completion_pct,
              eri_score, eri_last_computed_at, status, updated_at)
  ON seeker_profiles TO prowork_app;

GRANT SELECT, INSERT, UPDATE, DELETE ON seeker_skills TO prowork_app;
GRANT SELECT, INSERT, UPDATE ON seeker_certifications TO prowork_app;
GRANT SELECT, INSERT ON seeker_profile_events TO prowork_app;

COMMIT;
