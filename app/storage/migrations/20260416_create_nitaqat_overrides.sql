-- S36-G3: Nitaqat preview overrides — sovereign compliance layer
-- BRD Refs: Gold BRD A4, RT-1 §4.1, KSA Sovereign Compliance Layer
--
-- Append-only design:
--   REVOKE UPDATE, DELETE FROM prowork_app  (enforced below)
--   No soft-delete column — deleted records simply do not exist
--
-- RLS: tenant isolation — each row is visible only to its own tenant

BEGIN;

-- ── Table ──────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS nitaqat_preview_overrides (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         TEXT        NOT NULL,
  candidate_id      UUID        NOT NULL,
  original_params   JSONB       NOT NULL,
  overridden_params JSONB       NOT NULL,
  overridden_by     UUID        NOT NULL,
  reason            TEXT        NOT NULL CHECK (char_length(reason) >= 10),
  timestamp         TIMESTAMPTZ NOT NULL DEFAULT now(),
  evidence_pack_id  UUID        NULL
);

-- ── Indexes ───────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_npo_tenant_ts
  ON nitaqat_preview_overrides (tenant_id, timestamp DESC);

CREATE INDEX IF NOT EXISTS idx_npo_candidate
  ON nitaqat_preview_overrides (tenant_id, candidate_id);

-- ── Row-level security ────────────────────────────────────────────────────────
ALTER TABLE nitaqat_preview_overrides ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'nitaqat_preview_overrides'
      AND policyname = 'tenant_isolation'
  ) THEN
    CREATE POLICY tenant_isolation
      ON nitaqat_preview_overrides
      USING (tenant_id = current_setting('app.current_tenant', true));
  END IF;
END;
$$;

-- ── Append-only enforcement ───────────────────────────────────────────────────
-- Only strip UPDATE/DELETE if the role exists (mirrors S36-G1 pattern).
-- Verify GCP Cloud SQL app role name matches 'prowork_app' before production.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'prowork_app') THEN
    REVOKE UPDATE, DELETE ON nitaqat_preview_overrides FROM prowork_app;
  END IF;
END;
$$;

COMMIT;
