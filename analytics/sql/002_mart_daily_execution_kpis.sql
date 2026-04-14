CREATE OR REPLACE VIEW `{{PROJECT_ID}}.{{DATASET}}.mart_daily_execution_kpis` AS
SELECT
  DATE(occurred_at) AS event_date,
  COUNTIF(event_name = 'PROJECT_CREATED') AS projects_created_count,
  COUNTIF(event_name = 'MILESTONE_COMPLETED') AS milestones_completed_count,
  COUNTIF(event_name = 'EXECUTION_JOB_COMPLETED') AS execution_jobs_completed_count,
  COUNTIF(event_name = 'DELIVERABLE_APPROVED') AS deliverables_approved_count
FROM `{{PROJECT_ID}}.{{DATASET}}.raw_platform_events`
GROUP BY event_date;
