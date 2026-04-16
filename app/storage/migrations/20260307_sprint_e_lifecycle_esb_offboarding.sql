BEGIN;

CREATE TABLE IF NOT EXISTS worker_lifecycle_cases (
  worker_id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL,
  current_status TEXT NOT NULL,
  previous_status TEXT,
  updated_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS lifecycle_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  worker_id UUID NOT NULL,
  alert_code TEXT NOT NULL,
  severity TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS esb_calculations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  offboarding_case_id UUID NOT NULL,
  policy_version TEXT NOT NULL,
  months_of_service INTEGER NOT NULL,
  last_base_wage NUMERIC(12,2) NOT NULL,
  calculated_amount NUMERIC(12,2) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS offboarding_cases (
  offboarding_case_id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL,
  worker_id UUID NOT NULL,
  notice_date TIMESTAMPTZ,
  status TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS offboarding_checklist_items (
  item_id UUID PRIMARY KEY,
  offboarding_case_id UUID NOT NULL REFERENCES offboarding_cases(offboarding_case_id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  status TEXT NOT NULL,
  completed_at TIMESTAMPTZ,
  completed_by UUID
);

CREATE TABLE IF NOT EXISTS handover_records (
  handover_id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL,
  offboarding_case_id UUID NOT NULL REFERENCES offboarding_cases(offboarding_case_id) ON DELETE CASCADE,
  worker_id UUID NOT NULL,
  asset_type TEXT NOT NULL,
  recipient_actor_id UUID,
  recorded_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS offboarding_audit_exports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  offboarding_case_id UUID NOT NULL REFERENCES offboarding_cases(offboarding_case_id) ON DELETE CASCADE,
  export_type TEXT NOT NULL,
  artifact_ref TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMIT;
