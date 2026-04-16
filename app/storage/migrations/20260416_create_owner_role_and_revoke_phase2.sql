-- Phase 2: run as prowork_app (current table owner)
-- Transfers ownership of append-only tables to prowork_owner
-- Then grants INSERT+SELECT only back to prowork_app

ALTER TABLE recommendation_audit_logs    OWNER TO prowork_owner;
ALTER TABLE contract_lifecycle_events    OWNER TO prowork_owner;
ALTER TABLE evidence_packs               OWNER TO prowork_owner;
ALTER TABLE evidence_files               OWNER TO prowork_owner;
ALTER TABLE evidence_approvals           OWNER TO prowork_owner;
ALTER TABLE evidence_ai_artifacts        OWNER TO prowork_owner;
ALTER TABLE nitaqat_preview_overrides    OWNER TO prowork_owner;
ALTER TABLE probation_governance_records OWNER TO prowork_owner;
ALTER TABLE qiwa_contracts               OWNER TO prowork_owner;
ALTER TABLE sdp_programmes               OWNER TO prowork_owner;
ALTER TABLE sdp_enrolments               OWNER TO prowork_owner;

GRANT INSERT, SELECT ON recommendation_audit_logs    TO prowork_app;
GRANT INSERT, SELECT ON contract_lifecycle_events    TO prowork_app;
GRANT INSERT, SELECT ON evidence_packs               TO prowork_app;
GRANT INSERT, SELECT ON evidence_files               TO prowork_app;
GRANT INSERT, SELECT ON evidence_approvals           TO prowork_app;
GRANT INSERT, SELECT ON evidence_ai_artifacts        TO prowork_app;
GRANT INSERT, SELECT ON nitaqat_preview_overrides    TO prowork_app;
GRANT INSERT, SELECT ON probation_governance_records TO prowork_app;
GRANT INSERT, SELECT ON qiwa_contracts               TO prowork_app;
GRANT INSERT, SELECT ON sdp_programmes               TO prowork_app;
GRANT INSERT, SELECT ON sdp_enrolments               TO prowork_app;
