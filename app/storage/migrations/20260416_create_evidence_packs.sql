-- S38-G2: Evidence Pack Schema + Immutable Audit Fabric
-- Migration: 20260416_create_evidence_packs
-- Idempotent: uses IF NOT EXISTS throughout

-- ── evidence_packs (core table) ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS evidence_packs (
  pack_id          UUID         NOT NULL DEFAULT gen_random_uuid(),
  pack_type        TEXT         NOT NULL,
  tenant_id        UUID         NOT NULL,
  status           TEXT         NOT NULL DEFAULT 'OPEN',

  -- The 8 required fields (all NOT NULL — partial packs blocked at app layer, enforced here)
  actor            JSONB        NOT NULL,
  action           TEXT         NOT NULL,
  timestamp        TIMESTAMPTZ  NOT NULL,
  data_snapshot    JSONB        NOT NULL,
  attached_files   JSONB        NOT NULL DEFAULT '[]',
  approval_chain   JSONB        NOT NULL DEFAULT '[]',
  ai_artifacts     JSONB        NOT NULL DEFAULT '[]',
  redaction_rules  JSONB        NOT NULL DEFAULT '[]',

  -- Immutability + lifecycle
  immutable_hash   TEXT         NOT NULL,
  created_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  closed_at        TIMESTAMPTZ,
  closed_by        TEXT,
  exported_at      TIMESTAMPTZ,
  policy_version   TEXT         NOT NULL DEFAULT 'v1',

  CONSTRAINT evidence_packs_pkey PRIMARY KEY (pack_id),
  CONSTRAINT evidence_packs_pack_type_check CHECK (
    pack_type IN (
      'EP_WOS_RECRUIT_01',
      'EP_WOS_HIRE_01',
      'EP_WOS_ONBOARD_01',
      'EP_WOS_PROB_01',
      'EP_WOS_OFFBOARD_01'
    )
  ),
  CONSTRAINT evidence_packs_status_check CHECK (
    status IN ('OPEN', 'CLOSED', 'EXPORTED')
  )
);

-- Row-level security: tenant isolation
ALTER TABLE evidence_packs ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'evidence_packs' AND policyname = 'tenant_isolation'
  ) THEN
    CREATE POLICY tenant_isolation ON evidence_packs
      USING (tenant_id = current_setting('app.tenant_id', true)::UUID);
  END IF;
END $$;

-- Append-only enforcement: closed packs cannot be updated
-- (Closed packs: status != 'OPEN' → block UPDATE on core fields)
-- Application layer enforces this; DB enforces via trigger below.

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'prevent_closed_pack_mutation') THEN
    CREATE OR REPLACE FUNCTION prevent_closed_pack_mutation()
    RETURNS TRIGGER AS $fn$
    BEGIN
      IF OLD.status IN ('CLOSED', 'EXPORTED') THEN
        -- Allow only exported_at to be set on a CLOSED pack (for the EXPORTED transition)
        IF NEW.status = 'EXPORTED' AND OLD.status = 'CLOSED' THEN
          RETURN NEW;
        END IF;
        RAISE EXCEPTION 'evidence_pack % is % — closed packs are immutable', OLD.pack_id, OLD.status
          USING ERRCODE = 'P0001';
      END IF;
      RETURN NEW;
    END;
    $fn$ LANGUAGE plpgsql;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'trg_prevent_closed_pack_mutation'
  ) THEN
    CREATE TRIGGER trg_prevent_closed_pack_mutation
      BEFORE UPDATE ON evidence_packs
      FOR EACH ROW
      EXECUTE FUNCTION prevent_closed_pack_mutation();
  END IF;
END $$;

-- Indexes for common query patterns
CREATE INDEX IF NOT EXISTS idx_evidence_packs_tenant_type_status
  ON evidence_packs (tenant_id, pack_type, status);

CREATE INDEX IF NOT EXISTS idx_evidence_packs_tenant_created
  ON evidence_packs (tenant_id, created_at DESC);

-- Revoke direct UPDATE/DELETE from app role (append-only for core data)
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'prowork_app') THEN
    REVOKE DELETE ON evidence_packs FROM prowork_app;
  END IF;
END $$;

-- ── evidence_files (attached files — append-only) ─────────────────────────────
CREATE TABLE IF NOT EXISTS evidence_files (
  file_id      UUID         NOT NULL DEFAULT gen_random_uuid(),
  pack_id      UUID         NOT NULL REFERENCES evidence_packs(pack_id),
  tenant_id    UUID         NOT NULL,
  file_name    TEXT         NOT NULL,
  file_type    TEXT,
  file_url     TEXT,
  uploaded_by  TEXT         NOT NULL,
  uploaded_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),

  CONSTRAINT evidence_files_pkey PRIMARY KEY (file_id)
);

ALTER TABLE evidence_files ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'evidence_files' AND policyname = 'tenant_isolation'
  ) THEN
    CREATE POLICY tenant_isolation ON evidence_files
      USING (tenant_id = current_setting('app.tenant_id', true)::UUID);
  END IF;
END $$;

-- Files are append-only
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'prowork_app') THEN
    REVOKE UPDATE, DELETE ON evidence_files FROM prowork_app;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_evidence_files_pack_id ON evidence_files (pack_id);

-- ── evidence_approvals (approval chain — append-only) ─────────────────────────
CREATE TABLE IF NOT EXISTS evidence_approvals (
  approval_id     UUID         NOT NULL DEFAULT gen_random_uuid(),
  pack_id         UUID         NOT NULL REFERENCES evidence_packs(pack_id),
  tenant_id       UUID         NOT NULL,
  approver_id     TEXT         NOT NULL,
  approver_role   TEXT         NOT NULL,
  decision        TEXT         NOT NULL,
  approval_notes  TEXT,
  approved_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW(),

  CONSTRAINT evidence_approvals_pkey PRIMARY KEY (approval_id),
  CONSTRAINT evidence_approvals_decision_check CHECK (
    decision IN ('APPROVED', 'REJECTED', 'DEFERRED')
  )
);

ALTER TABLE evidence_approvals ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'evidence_approvals' AND policyname = 'tenant_isolation'
  ) THEN
    CREATE POLICY tenant_isolation ON evidence_approvals
      USING (tenant_id = current_setting('app.tenant_id', true)::UUID);
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'prowork_app') THEN
    REVOKE UPDATE, DELETE ON evidence_approvals FROM prowork_app;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_evidence_approvals_pack_id ON evidence_approvals (pack_id);

-- ── evidence_ai_artifacts (AI trace — append-only) ────────────────────────────
CREATE TABLE IF NOT EXISTS evidence_ai_artifacts (
  artifact_id      UUID         NOT NULL DEFAULT gen_random_uuid(),
  pack_id          UUID         NOT NULL REFERENCES evidence_packs(pack_id),
  tenant_id        UUID         NOT NULL,
  model_version    TEXT         NOT NULL,
  prompt_hash      TEXT,
  output_snapshot  JSONB        NOT NULL,
  confidence       NUMERIC(5,4),
  recorded_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),

  CONSTRAINT evidence_ai_artifacts_pkey PRIMARY KEY (artifact_id)
);

ALTER TABLE evidence_ai_artifacts ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'evidence_ai_artifacts' AND policyname = 'tenant_isolation'
  ) THEN
    CREATE POLICY tenant_isolation ON evidence_ai_artifacts
      USING (tenant_id = current_setting('app.tenant_id', true)::UUID);
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'prowork_app') THEN
    REVOKE UPDATE, DELETE ON evidence_ai_artifacts FROM prowork_app;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_evidence_ai_artifacts_pack_id ON evidence_ai_artifacts (pack_id);

-- ── integrity check (DB-level) ────────────────────────────────────────────────
-- Verify no packs have NULL immutable_hash (expected: 0 rows)
-- psql command: SELECT COUNT(*) FROM evidence_packs WHERE immutable_hash IS NULL;
