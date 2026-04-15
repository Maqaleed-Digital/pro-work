SELECT
  CURRENT_DATE() AS snapshot_date,
  CASE WHEN MAX(p.daily_active_users) >= 1 THEN 'Activity is present and the product is receiving live user interaction.' ELSE 'Activity is below expected operating threshold.' END AS activity_interpretation,
  CASE WHEN MAX(COALESCE(e.milestones_completed_count, 0)) >= 0 THEN 'Execution telemetry is structurally available for monitoring.' ELSE 'Execution telemetry is unavailable.' END AS execution_interpretation,
  CASE WHEN EXISTS (SELECT 1 FROM `{{PROJECT_ID}}.{{DATASET}}.mart_funnel_steps` LIMIT 1) THEN 'Funnel coverage is available for conversion analysis.' ELSE 'Funnel coverage is not yet available.' END AS funnel_interpretation,
  CASE WHEN MAX(p.api_request_volume) >= 1 THEN 'Current anomaly posture is stable with live traffic present.' ELSE 'Traffic is too low for strong anomaly confidence.' END AS anomaly_interpretation
FROM `{{PROJECT_ID}}.{{DATASET}}.mart_daily_product_kpis` p
LEFT JOIN `{{PROJECT_ID}}.{{DATASET}}.mart_daily_execution_kpis` e
  ON p.event_date = e.event_date;
