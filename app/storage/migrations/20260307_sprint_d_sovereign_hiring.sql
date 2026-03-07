-- ============================================================
-- PROWORK SPRINT D — SOVEREIGN HIRING (CANONICAL)
-- Migration: 20260307_sprint_d_sovereign_hiring.sql
-- BRD Version: V3
-- ============================================================

CREATE TABLE IF NOT EXISTS hiring_cases (
  id             TEXT PRIMARY KEY,
  tenant_id      TEXT NOT NULL,
  candidate_id   TEXT NOT NULL,
  requisition_id TEXT NOT NULL,
  status         TEXT NOT NULL,
  created_at     TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS offer_packages (
  id              TEXT PRIMARY KEY,
  hiring_case_id  TEXT NOT NULL REFERENCES hiring_cases(id),
  base_salary     INTEGER NOT NULL,
  currency        TEXT NOT NULL,
  gross_amount    INTEGER NOT NULL,
  status          TEXT NOT NULL,
  created_at      TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS offer_allowances (
  id           TEXT PRIMARY KEY,
  offer_id     TEXT NOT NULL REFERENCES offer_packages(id),
  allowance_type TEXT NOT NULL,
  amount       INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS hiring_approvals (
  id                TEXT PRIMARY KEY,
  hiring_case_id    TEXT NOT NULL REFERENCES hiring_cases(id),
  approver_actor_id TEXT NOT NULL,
  decision          TEXT NOT NULL,
  decided_at        TEXT
);

CREATE TABLE IF NOT EXISTS candidate_acceptances (
  id         TEXT PRIMARY KEY,
  offer_id   TEXT NOT NULL REFERENCES offer_packages(id),
  decision   TEXT NOT NULL,
  decided_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS contract_mappings (
  id              TEXT PRIMARY KEY,
  hiring_case_id  TEXT NOT NULL REFERENCES hiring_cases(id),
  mapping_status  TEXT NOT NULL,
  parity_score    INTEGER NOT NULL
);
