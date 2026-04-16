BEGIN;

-- ─── Projects ────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS wos_projects (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id     UUID        NOT NULL UNIQUE,
  tenant_id      UUID        NOT NULL,
  owner_user_id  UUID        NOT NULL,
  title          TEXT        NOT NULL,
  description    TEXT,
  status         TEXT        NOT NULL DEFAULT 'DISCUSSION'
                             CHECK (status IN ('DISCUSSION','ACTIVE','COMPLETED','ARCHIVED')),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_wos_projects_tenant
  ON wos_projects (tenant_id, status, created_at DESC);

-- ─── Workstreams ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS wos_workstreams (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  workstream_id  UUID        NOT NULL UNIQUE,
  tenant_id      UUID        NOT NULL,
  project_id     UUID        NOT NULL REFERENCES wos_projects(project_id),
  stream_name    TEXT        NOT NULL,
  description    TEXT,
  status         TEXT        NOT NULL DEFAULT 'ACTIVE'
                             CHECK (status IN ('ACTIVE','PAUSED','COMPLETED')),
  created_by     UUID        NOT NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_wos_workstreams_project
  ON wos_workstreams (tenant_id, project_id, status);

-- ─── Milestones ──────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS wos_milestones (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  milestone_id   UUID        NOT NULL UNIQUE,
  tenant_id      UUID        NOT NULL,
  workstream_id  UUID        NOT NULL REFERENCES wos_workstreams(workstream_id),
  project_id     UUID        NOT NULL,
  title          TEXT        NOT NULL,
  description    TEXT,
  status         TEXT        NOT NULL DEFAULT 'OPEN'
                             CHECK (status IN ('OPEN','IN_PROGRESS','COMPLETED')),
  created_by     UUID        NOT NULL,
  completed_at   TIMESTAMPTZ,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_wos_milestones_workstream
  ON wos_milestones (tenant_id, workstream_id, status);

-- ─── Workers ─────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS wos_workers (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  worker_id      UUID        NOT NULL UNIQUE,
  tenant_id      UUID        NOT NULL,
  type           TEXT        NOT NULL CHECK (type IN ('FTE','FREELANCER')),
  display_name   TEXT        NOT NULL,
  email          TEXT,
  skills         JSONB       NOT NULL DEFAULT '[]'::jsonb,
  availability   JSONB       NOT NULL DEFAULT '{}'::jsonb,
  status         TEXT        NOT NULL DEFAULT 'ACTIVE'
                             CHECK (status IN ('ACTIVE','INACTIVE','SUSPENDED')),
  assigned_pod   JSONB,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_wos_workers_tenant_status
  ON wos_workers (tenant_id, status);

-- ─── Pods ─────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS wos_pods (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  pod_id         UUID        NOT NULL UNIQUE,
  tenant_id      UUID        NOT NULL,
  name           TEXT        NOT NULL,
  state          TEXT        NOT NULL DEFAULT 'ACTIVE'
                             CHECK (state IN ('ACTIVE','INACTIVE')),
  capacity       JSONB       NOT NULL DEFAULT '{"max_workers":10}'::jsonb,
  roles          JSONB       NOT NULL DEFAULT '["member"]'::jsonb,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_wos_pods_tenant_state
  ON wos_pods (tenant_id, state);

-- ─── Assignments ──────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS wos_assignments (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_id   UUID        NOT NULL UNIQUE,
  tenant_id       UUID        NOT NULL,
  worker_id       UUID        NOT NULL,
  pod_id          UUID        NOT NULL,
  role            TEXT        NOT NULL DEFAULT 'member',
  state           TEXT        NOT NULL DEFAULT 'ACTIVE'
                              CHECK (state IN ('ACTIVE','INACTIVE')),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_wos_assignments_pod
  ON wos_assignments (tenant_id, pod_id, state);

CREATE INDEX IF NOT EXISTS idx_wos_assignments_worker
  ON wos_assignments (worker_id, state);

-- ─── Execution Jobs ───────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS wos_execution_jobs (
  id                 UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  execution_job_id   UUID        NOT NULL UNIQUE,
  tenant_id          UUID        NOT NULL,
  project_id         UUID        NOT NULL,
  milestone_id       UUID        NOT NULL,
  job_type           TEXT        NOT NULL,
  status             TEXT        NOT NULL DEFAULT 'PENDING'
                                 CHECK (status IN ('PENDING','RUNNING','COMPLETED','FAILED')),
  artifact_count     INTEGER     NOT NULL DEFAULT 0,
  requires_approval  BOOLEAN     NOT NULL DEFAULT FALSE,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_wos_execution_jobs_milestone
  ON wos_execution_jobs (tenant_id, milestone_id, status);

-- ─── Dashboard Projection (persisted read model) ──────────────────────────────

CREATE TABLE IF NOT EXISTS wos_dashboard_projection (
  id                             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id                      UUID        NOT NULL UNIQUE,
  project_count                  INTEGER     NOT NULL DEFAULT 0,
  workstream_count               INTEGER     NOT NULL DEFAULT 0,
  milestone_open_count           INTEGER     NOT NULL DEFAULT 0,
  milestone_completed_count      INTEGER     NOT NULL DEFAULT 0,
  execution_job_completed_count  INTEGER     NOT NULL DEFAULT 0,
  last_event_id                  UUID,
  last_event_type                TEXT,
  last_event_at                  TIMESTAMPTZ,
  updated_at                     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMIT;
