-- ============================================================
-- PROWORK SPRINT D — SOVEREIGN HIRING
-- Migration: 20260307_sprint_d_sovereign_hiring.sql
-- BRD Version: V3
-- ============================================================

-- Compensation packages
CREATE TABLE IF NOT EXISTS compensation_packages (
  package_id      UUID        PRIMARY KEY,
  tenant_id       UUID        NOT NULL,
  requisition_id  UUID        NOT NULL,
  candidate_id    UUID        NOT NULL,
  base_salary     NUMERIC     NOT NULL CHECK (base_salary > 0),
  currency        VARCHAR(3)  NOT NULL DEFAULT 'SAR',
  allowances      JSONB       NOT NULL DEFAULT '[]',
  status          VARCHAR(20) NOT NULL DEFAULT 'DRAFT'
                              CHECK (status IN ('DRAFT', 'APPROVED')),
  approved_by     TEXT,
  approved_at     TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL,
  updated_at      TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_compensation_packages_tenant
  ON compensation_packages (tenant_id);
CREATE INDEX IF NOT EXISTS idx_compensation_packages_requisition
  ON compensation_packages (requisition_id);

-- Hiring offers
CREATE TABLE IF NOT EXISTS hiring_offers (
  offer_id        UUID        PRIMARY KEY,
  tenant_id       UUID        NOT NULL,
  requisition_id  UUID        NOT NULL,
  candidate_id    UUID        NOT NULL,
  package_id      UUID        NOT NULL REFERENCES compensation_packages (package_id),
  status          VARCHAR(20) NOT NULL DEFAULT 'PENDING'
                              CHECK (status IN ('PENDING', 'SENT', 'WITHDRAWN')),
  expiry_date     TIMESTAMPTZ,
  sent_by         TEXT,
  sent_at         TIMESTAMPTZ,
  withdrawn_by    TEXT,
  withdrawn_at    TIMESTAMPTZ,
  reason_code     TEXT,
  created_at      TIMESTAMPTZ NOT NULL,
  updated_at      TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_hiring_offers_tenant
  ON hiring_offers (tenant_id);
CREATE INDEX IF NOT EXISTS idx_hiring_offers_requisition
  ON hiring_offers (requisition_id);
CREATE INDEX IF NOT EXISTS idx_hiring_offers_candidate
  ON hiring_offers (candidate_id);

-- Hiring approvals
CREATE TABLE IF NOT EXISTS hiring_approvals (
  approval_id     UUID        PRIMARY KEY,
  tenant_id       UUID        NOT NULL,
  offer_id        UUID        NOT NULL REFERENCES hiring_offers (offer_id),
  requisition_id  UUID        NOT NULL,
  requested_by    TEXT        NOT NULL,
  approver_id     TEXT        NOT NULL,
  approval_level  VARCHAR(10) NOT NULL DEFAULT 'L1',
  status          VARCHAR(20) NOT NULL DEFAULT 'PENDING'
                              CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED')),
  decision        VARCHAR(20),
  decided_at      TIMESTAMPTZ,
  notes           TEXT,
  requested_at    TIMESTAMPTZ NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_hiring_approvals_tenant
  ON hiring_approvals (tenant_id);
CREATE INDEX IF NOT EXISTS idx_hiring_approvals_offer
  ON hiring_approvals (offer_id);

-- Candidate acceptances
CREATE TABLE IF NOT EXISTS candidate_acceptances (
  acceptance_id   UUID        PRIMARY KEY,
  tenant_id       UUID        NOT NULL,
  offer_id        UUID        NOT NULL REFERENCES hiring_offers (offer_id),
  candidate_id    UUID        NOT NULL,
  response        VARCHAR(20) NOT NULL CHECK (response IN ('ACCEPTED', 'DECLINED')),
  responded_at    TIMESTAMPTZ NOT NULL,
  decline_reason  TEXT,
  created_at      TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_candidate_acceptances_tenant
  ON candidate_acceptances (tenant_id);
CREATE INDEX IF NOT EXISTS idx_candidate_acceptances_offer
  ON candidate_acceptances (offer_id);

-- Hiring decisions
CREATE TABLE IF NOT EXISTS hiring_decisions (
  decision_id     UUID        PRIMARY KEY,
  tenant_id       UUID        NOT NULL,
  requisition_id  UUID        NOT NULL,
  candidate_id    UUID        NOT NULL,
  offer_id        UUID        REFERENCES hiring_offers (offer_id),
  decision        VARCHAR(20) NOT NULL CHECK (decision IN ('HIRED', 'NOT_HIRED')),
  decided_by      TEXT        NOT NULL,
  decision_reason TEXT,
  decided_at      TIMESTAMPTZ NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_hiring_decisions_tenant
  ON hiring_decisions (tenant_id);
CREATE INDEX IF NOT EXISTS idx_hiring_decisions_requisition
  ON hiring_decisions (requisition_id);
CREATE INDEX IF NOT EXISTS idx_hiring_decisions_candidate
  ON hiring_decisions (candidate_id);
