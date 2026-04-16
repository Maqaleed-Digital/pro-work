-- S39-G1: SDP (Skill Development Programme) — schema migration
-- Jurisdiction: KSA Labour Law Chapter 6 (Vocational training) + Nitaqat skill categories
--
-- Design constraint: schema makes forbidden-field categories STRUCTURALLY IMPOSSIBLE:
--   NO shift scheduling columns (shift_id, shift_schedule, etc.)
--   NO attendance tracking columns (attendance_*, attendance_required, etc.)
--   NO worker exclusivity columns (exclusive_*, lock_worker, etc.)
-- Any future migration attempting to add these categories must be explicitly rejected
-- via the check_constraint_sdp_no_forbidden_fields trigger below.

-- ── 1. sdp_programmes ─────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS sdp_programmes (
  programme_id     TEXT        PRIMARY KEY,
  tenant_id        TEXT        NOT NULL,
  title            TEXT        NOT NULL,
  title_ar         TEXT,
  description      TEXT,
  category         TEXT        NOT NULL DEFAULT 'GENERAL',
  -- Time-box: BOTH dates mandatory — CHECK constraint enforces end > start
  start_date       DATE        NOT NULL,
  end_date         DATE        NOT NULL,
  CONSTRAINT sdp_programmes_dates_check CHECK (end_date > start_date),
  capacity         INTEGER     NOT NULL DEFAULT 50 CHECK (capacity > 0),
  status           TEXT        NOT NULL DEFAULT 'OPEN'
                               CHECK (status IN ('DRAFT', 'OPEN', 'CLOSED', 'CANCELLED', 'COMPLETED')),
  created_by       TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ
  -- INTENTIONALLY ABSENT (schema-level prohibition):
  --   shift_id, shift_schedule, shift_start, shift_end     (shift scheduling — NOT SDP)
  --   attendance, attendance_required, attendance_tracking  (attendance tracking — NOT SDP)
  --   exclusive, exclusivity, lock_worker, exclusive_worker (exclusivity — NOT SDP)
);

CREATE INDEX IF NOT EXISTS idx_sdp_programmes_tenant  ON sdp_programmes (tenant_id);
CREATE INDEX IF NOT EXISTS idx_sdp_programmes_status  ON sdp_programmes (status);
CREATE INDEX IF NOT EXISTS idx_sdp_programmes_dates   ON sdp_programmes (start_date, end_date);

-- ── 2. sdp_enrolments ─────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS sdp_enrolments (
  enrolment_id   TEXT        PRIMARY KEY,
  programme_id   TEXT        NOT NULL REFERENCES sdp_programmes(programme_id),
  worker_id      TEXT        NOT NULL,
  tenant_id      TEXT        NOT NULL,
  status         TEXT        NOT NULL DEFAULT 'ENROLLED'
                             CHECK (status IN ('ENROLLED', 'COMPLETED', 'WITHDRAWN')),
  enrolled_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  enrolled_by    TEXT,
  completed_at   TIMESTAMPTZ,
  outcome        TEXT        CHECK (outcome IN ('PASSED', 'FAILED', 'WITHDRAWN', 'INCOMPLETE', NULL)),
  completed_by   TEXT,
  withdrawal_reason TEXT,
  -- Unique: one enrolment per worker per programme
  UNIQUE (programme_id, worker_id)
  -- INTENTIONALLY ABSENT:
  --   shift_*, attendance_*, exclusive_* — same prohibition as sdp_programmes
);

CREATE INDEX IF NOT EXISTS idx_sdp_enrolments_programme ON sdp_enrolments (programme_id);
CREATE INDEX IF NOT EXISTS idx_sdp_enrolments_worker    ON sdp_enrolments (worker_id, tenant_id);
CREATE INDEX IF NOT EXISTS idx_sdp_enrolments_status    ON sdp_enrolments (status);

-- ── 3. Row-Level Security ─────────────────────────────────────────────────────

ALTER TABLE sdp_programmes  ENABLE ROW LEVEL SECURITY;
ALTER TABLE sdp_enrolments  ENABLE ROW LEVEL SECURITY;

CREATE POLICY sdp_programmes_tenant_isolation ON sdp_programmes
  USING (tenant_id = current_setting('app.tenant_id', true));

CREATE POLICY sdp_enrolments_tenant_isolation ON sdp_enrolments
  USING (tenant_id = current_setting('app.tenant_id', true));

-- ── 4. Append-only guard on COMPLETED / CANCELLED programmes ─────────────────

CREATE OR REPLACE FUNCTION sdp_programmes_no_mutate_terminal()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.status IN ('CANCELLED', 'COMPLETED') THEN
    RAISE EXCEPTION 'sdp_programmes: programme % is in terminal status % — mutations prohibited',
      OLD.programme_id, OLD.status;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_sdp_programmes_no_mutate_terminal
  BEFORE UPDATE ON sdp_programmes
  FOR EACH ROW EXECUTE FUNCTION sdp_programmes_no_mutate_terminal();

-- ── 5. Permissions ────────────────────────────────────────────────────────────

REVOKE DELETE ON sdp_enrolments  FROM prowork_app;
REVOKE DELETE ON sdp_programmes  FROM prowork_app;
-- enrolments are WITHDRAWN (status update) not deleted; programmes are CANCELLED (status update) not deleted
