-- S36-G1: AI Governance — RecommendationAuditLog schema
-- BRD Refs: Gold BRD A4, WOS §11.3, RT-1 §8.2
-- Append-only: no UPDATE or DELETE permissions granted to application role
-- RLS: tenant isolation enforced on every query

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS recommendation_audit_logs (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  timestamp           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  actor               UUID        NOT NULL,
  action_type         TEXT        NOT NULL CHECK (action_type IN (
                        'RECOMMENDATION', 'MATCH', 'COMPLIANCE_HINT', 'SUMMARY', 'RISK_SCORE'
                      )),
  input_signals       JSONB       NOT NULL DEFAULT '{}'::jsonb,
  rationale           TEXT,
  confidence_score    NUMERIC(4,2) NOT NULL CHECK (confidence_score >= 0.00 AND confidence_score <= 1.00),
  model_version       TEXT        NOT NULL,
  prompt_hash         TEXT        NOT NULL,
  output_snapshot     JSONB       NOT NULL DEFAULT '{}'::jsonb,
  reviewer_decision   TEXT        NOT NULL DEFAULT 'PENDING' CHECK (reviewer_decision IN (
                        'ACCEPTED', 'REJECTED', 'OVERRIDDEN', 'PENDING'
                      )),
  reviewer_id         UUID,
  reviewed_at         TIMESTAMPTZ,
  override_reason     TEXT,
  bias_score          NUMERIC(4,2) CHECK (bias_score IS NULL OR (bias_score >= 0.00 AND bias_score <= 1.00)),
  tenant_id           UUID        NOT NULL,
  immutable_hash      TEXT        NOT NULL
);

-- Composite index for tenant-scoped time-ordered queries
CREATE INDEX IF NOT EXISTS idx_ral_tenant_timestamp
  ON recommendation_audit_logs (tenant_id, timestamp DESC);

-- Index for pending approval queue
CREATE INDEX IF NOT EXISTS idx_ral_reviewer_decision
  ON recommendation_audit_logs (reviewer_decision)
  WHERE reviewer_decision = 'PENDING';

-- Row Level Security: tenant isolation mandatory
ALTER TABLE recommendation_audit_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY ral_tenant_isolation ON recommendation_audit_logs
  USING (tenant_id = current_setting('app.tenant_id')::uuid);

-- Append-only enforcement: revoke UPDATE and DELETE from application role
-- Replace 'prowork_app' with the actual application database role name
DO $$
BEGIN
  IF EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'prowork_app') THEN
    REVOKE UPDATE ON recommendation_audit_logs FROM prowork_app;
    REVOKE DELETE ON recommendation_audit_logs FROM prowork_app;
  END IF;
END
$$;

-- readonly role: SELECT only
DO $$
BEGIN
  IF EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'prowork_readonly') THEN
    GRANT SELECT ON recommendation_audit_logs TO prowork_readonly;
  END IF;
END
$$;

COMMIT;
