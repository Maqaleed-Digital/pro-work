BEGIN;

CREATE TABLE IF NOT EXISTS onboarding_cases (
  onboarding_case_id  UUID        PRIMARY KEY,
  tenant_id           UUID        NOT NULL,
  worker_id           UUID        NOT NULL,
  requisition_id      UUID,
  checklist_template  TEXT        NOT NULL DEFAULT 'DEFAULT_KSA',
  status              TEXT        NOT NULL DEFAULT 'ACTIVE',
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS onboarding_checklist_items (
  checklist_item_id   UUID        PRIMARY KEY,
  onboarding_case_id  UUID        NOT NULL REFERENCES onboarding_cases(onboarding_case_id) ON DELETE CASCADE,
  title               TEXT        NOT NULL,
  item_type           TEXT        NOT NULL DEFAULT 'TASK',
  status              TEXT        NOT NULL DEFAULT 'PENDING',
  due_at              TIMESTAMPTZ,
  completed_at        TIMESTAMPTZ,
  completed_by        UUID,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS worker_documents (
  document_id         UUID        PRIMARY KEY,
  tenant_id           UUID        NOT NULL,
  worker_id           UUID        NOT NULL,
  onboarding_case_id  UUID        NOT NULL REFERENCES onboarding_cases(onboarding_case_id) ON DELETE CASCADE,
  document_type       TEXT        NOT NULL,
  verification_status TEXT        NOT NULL DEFAULT 'PENDING',
  file_ref            TEXT,
  issued_at           TIMESTAMPTZ,
  expires_at          TIMESTAMPTZ,
  verified_by         UUID,
  verified_at         TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS worker_consents (
  consent_id          UUID        PRIMARY KEY,
  tenant_id           UUID        NOT NULL,
  worker_id           UUID        NOT NULL,
  onboarding_case_id  UUID        NOT NULL REFERENCES onboarding_cases(onboarding_case_id) ON DELETE CASCADE,
  consent_type        TEXT        NOT NULL,
  consent_version     TEXT        NOT NULL,
  acknowledged_at     TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS employment_contracts (
  contract_id         UUID        PRIMARY KEY,
  tenant_id           UUID        NOT NULL,
  worker_id           UUID        NOT NULL,
  onboarding_case_id  UUID        NOT NULL REFERENCES onboarding_cases(onboarding_case_id) ON DELETE CASCADE,
  template_id         TEXT,
  role_title          TEXT        NOT NULL,
  wage_base           NUMERIC(14,2) NOT NULL,
  allowances          JSONB       NOT NULL DEFAULT '[]'::jsonb,
  probation_days      INTEGER     NOT NULL DEFAULT 90,
  notice_days         INTEGER     NOT NULL DEFAULT 30,
  status              TEXT        NOT NULL DEFAULT 'DRAFT',
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS wps_readiness_artifacts (
  artifact_id         UUID        PRIMARY KEY,
  tenant_id           UUID        NOT NULL,
  worker_id           UUID        NOT NULL,
  onboarding_case_id  UUID        NOT NULL REFERENCES onboarding_cases(onboarding_case_id) ON DELETE CASCADE,
  file_name           TEXT        NOT NULL,
  structure_valid     BOOLEAN     NOT NULL,
  line_count          INTEGER     NOT NULL,
  approver_ids        JSONB       NOT NULL DEFAULT '[]'::jsonb,
  generated_at        TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS worker_ibans (
  worker_id               UUID        PRIMARY KEY,
  onboarding_case_id      UUID        NOT NULL REFERENCES onboarding_cases(onboarding_case_id) ON DELETE CASCADE,
  iban                    TEXT        NOT NULL,
  bank_confirmation_status TEXT       NOT NULL DEFAULT 'PENDING',
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS probation_cases (
  probation_case_id   UUID        PRIMARY KEY,
  tenant_id           UUID        NOT NULL,
  worker_id           UUID        NOT NULL,
  onboarding_case_id  UUID        NOT NULL REFERENCES onboarding_cases(onboarding_case_id) ON DELETE CASCADE,
  probation_days      INTEGER     NOT NULL DEFAULT 90,
  status              TEXT        NOT NULL DEFAULT 'ACTIVE',
  decision_status     TEXT        NOT NULL DEFAULT 'PENDING',
  decision_reason_code TEXT,
  extension_days      INTEGER     NOT NULL DEFAULT 0,
  started_at          TIMESTAMPTZ NOT NULL,
  decision_at         TIMESTAMPTZ,
  day80_pack_generated_at TIMESTAMPTZ,
  evidence_summary    JSONB       NOT NULL DEFAULT '{}'::jsonb
);

COMMIT;
