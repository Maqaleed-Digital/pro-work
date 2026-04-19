-- S44-G1: Contract tables — contracts, contract_events, contract_templates
-- RLS enforced. Append-only audit spine on contract_events.

BEGIN;

-- ── contracts ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS contracts (
  id                            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id                     VARCHAR(64) NOT NULL REFERENCES tenants(id),
  application_id                UUID NOT NULL REFERENCES applications(id),
  offer_id                      UUID NOT NULL REFERENCES offers(id),
  candidate_id                  UUID NOT NULL REFERENCES candidates(id),
  requisition_id                UUID NOT NULL REFERENCES requisitions(id),
  contract_type                 VARCHAR(32) NOT NULL
    CHECK (contract_type IN ('FTE', 'FREELANCER', 'AI_EXECUTABLE')),
  status                        VARCHAR(32) NOT NULL DEFAULT 'DRAFT'
    CHECK (status IN ('DRAFT','REVIEW','SIGNED','ACTIVATED','AMENDED','TERMINATED','EXPIRED')),
  qiwa_parity_json              JSONB NOT NULL DEFAULT '{}',
  qiwa_field_completeness_pct   INTEGER NOT NULL DEFAULT 0,
  template_version              TEXT,
  signed_at                     TIMESTAMPTZ,
  activated_at                  TIMESTAMPTZ,
  terminated_at                 TIMESTAMPTZ,
  termination_reason            TEXT,
  created_at                    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_contracts_tenant      ON contracts(tenant_id);
CREATE INDEX IF NOT EXISTS idx_contracts_application ON contracts(application_id);
CREATE INDEX IF NOT EXISTS idx_contracts_status      ON contracts(status);

-- ── contract_events (audit spine — append-only) ─────────────────────────────
CREATE TABLE IF NOT EXISTS contract_events (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        VARCHAR(64) NOT NULL REFERENCES tenants(id),
  contract_id      UUID NOT NULL REFERENCES contracts(id),
  event_type       VARCHAR(32) NOT NULL
    CHECK (event_type IN ('DRAFT_CREATED','MOVED_TO_REVIEW','SIGNED','ACTIVATED',
                          'AMENDED','TERMINATED','EVIDENCE_GENERATED')),
  previous_status  VARCHAR(32),
  new_status       VARCHAR(32),
  actor_user_id    UUID REFERENCES users(id),
  actor_type       VARCHAR(16) NOT NULL DEFAULT 'HUMAN'
    CHECK (actor_type IN ('HUMAN','AI','SYSTEM')),
  payload          JSONB DEFAULT '{}',
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_contract_events_contract ON contract_events(contract_id);
CREATE INDEX IF NOT EXISTS idx_contract_events_tenant   ON contract_events(tenant_id);

-- ── contract_templates (read-only at runtime) ───────────────────────────────
CREATE TABLE IF NOT EXISTS contract_templates (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           VARCHAR(64),
  template_type       VARCHAR(64) NOT NULL
    CHECK (template_type IN ('FTE_STANDARD_KSA','FTE_FIXED_TERM_KSA',
                             'FREELANCER_MILESTONE','AI_EXECUTABLE_OUTCOME')),
  version             TEXT NOT NULL,
  body_en             TEXT NOT NULL,
  body_ar             TEXT NOT NULL,
  required_qiwa_fields TEXT[] NOT NULL,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Row-Level Security ──────────────────────────────────────────────────────
ALTER TABLE contracts        ENABLE ROW LEVEL SECURITY;
ALTER TABLE contract_events  ENABLE ROW LEVEL SECURITY;
ALTER TABLE contract_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_contracts ON contracts
  USING (COALESCE(current_setting('app.current_tenant_id', true), '') = ''
    OR tenant_id = current_setting('app.current_tenant_id', true));

CREATE POLICY tenant_isolation_contract_events ON contract_events
  USING (COALESCE(current_setting('app.current_tenant_id', true), '') = ''
    OR tenant_id = current_setting('app.current_tenant_id', true));

CREATE POLICY tenant_isolation_contract_templates ON contract_templates
  USING (tenant_id IS NULL
    OR COALESCE(current_setting('app.current_tenant_id', true), '') = ''
    OR tenant_id = current_setting('app.current_tenant_id', true));

-- ── Grants ──────────────────────────────────────────────────────────────────
GRANT SELECT, INSERT ON contracts TO prowork_app;
GRANT UPDATE (status, qiwa_parity_json, qiwa_field_completeness_pct,
              signed_at, activated_at, terminated_at, termination_reason, updated_at)
  ON contracts TO prowork_app;

GRANT SELECT, INSERT ON contract_events TO prowork_app;
-- No UPDATE, no DELETE on contract_events (append-only)

GRANT SELECT ON contract_templates TO prowork_app;
-- No INSERT/UPDATE/DELETE on templates from app role

-- ── Seed templates ──────────────────────────────────────────────────────────
INSERT INTO contract_templates (id, tenant_id, template_type, version, body_en, body_ar, required_qiwa_fields) VALUES
  (gen_random_uuid(), NULL, 'FTE_STANDARD_KSA', 'v1',
   '# Employment Contract\n\nThis contract is entered into between the Employer and the Employee under the laws of the Kingdom of Saudi Arabia.\n\n## Terms\n- Role: {{role}}\n- Base Wage: {{wage_base}} SAR\n- Probation: {{probation_days}} days\n- Notice Period: {{notice_period_days}} days',
   '# عقد عمل\n\nيُبرم هذا العقد بين صاحب العمل والموظف وفقاً لأنظمة المملكة العربية السعودية.\n\n## الشروط\n- الوظيفة: {{role}}\n- الراتب الأساسي: {{wage_base}} ر.س\n- فترة التجربة: {{probation_days}} يوم\n- فترة الإشعار: {{notice_period_days}} يوم',
   ARRAY['role', 'wage_base', 'probation_days', 'notice_period_days', 'work_location', 'nationality', 'occupation_code']),

  (gen_random_uuid(), NULL, 'FREELANCER_MILESTONE', 'v1',
   '# Freelance Service Agreement\n\nThis agreement governs the delivery of milestone-based services.\n\n## Terms\n- Milestones: {{milestones}}\n- Total Value: {{total_value}} SAR\n- 0% freelancer commission — the freelancer receives 100% of their agreed rate.',
   '# اتفاقية خدمات مستقل\n\nتحكم هذه الاتفاقية تقديم الخدمات على أساس المراحل.\n\n## الشروط\n- المراحل: {{milestones}}\n- القيمة الإجمالية: {{total_value}} ر.س\n- 0% عمولة — يستلم المستقل 100% من أجره المتفق عليه.',
   ARRAY['milestones', 'total_value', 'escrow_terms']),

  (gen_random_uuid(), NULL, 'AI_EXECUTABLE_OUTCOME', 'v1',
   '# AI Service Delivery Agreement\n\nThis agreement defines outcome-based AI service delivery.\n\n## Terms\n- Delivery Window: {{delivery_window}}\n- Outcome Criteria: {{outcome_criteria}}\n- Model Version: {{model_version}}\n- All AI actions are logged with full rationale per Gold BRD §A4.',
   '# اتفاقية تنفيذ خدمات الذكاء الاصطناعي\n\nتحدد هذه الاتفاقية تقديم خدمات الذكاء الاصطناعي القائمة على النتائج.\n\n## الشروط\n- نافذة التسليم: {{delivery_window}}\n- معايير النتائج: {{outcome_criteria}}\n- إصدار النموذج: {{model_version}}\n- يتم تسجيل جميع إجراءات الذكاء الاصطناعي مع المبررات الكاملة.',
   ARRAY['delivery_window', 'outcome_criteria', 'model_version'])
ON CONFLICT DO NOTHING;

COMMIT;
