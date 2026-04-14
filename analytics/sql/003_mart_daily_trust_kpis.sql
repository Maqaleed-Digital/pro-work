CREATE OR REPLACE VIEW `{{PROJECT_ID}}.{{DATASET}}.mart_daily_trust_kpis` AS
SELECT
  DATE(occurred_at) AS event_date,
  COUNTIF(event_name = 'AGENT_JOB_COMPLETED') AS agent_jobs_completed_count,
  COUNTIF(event_name = 'PHR_REVIEW_APPROVED') AS phr_reviews_approved_count,
  COUNTIF(event_name = 'EVIDENCE_PACK_GENERATED') AS evidence_packs_generated_count,
  COUNTIF(event_name = 'TRUST_LEDGER_APPENDED') AS trust_ledger_appends_count,
  COUNTIF(event_name = 'TOKEN_ISSUED') AS tokens_issued_count
FROM `{{PROJECT_ID}}.{{DATASET}}.raw_platform_events`
GROUP BY event_date;
