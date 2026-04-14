SELECT
  CURRENT_DATE() AS snapshot_date,
  CASE WHEN EXISTS (SELECT 1 FROM `{{PROJECT_ID}}.{{DATASET}}.mart_daily_product_kpis` LIMIT 1) THEN 1 ELSE 0 END AS trend_coverage_present,
  CASE WHEN EXISTS (SELECT 1 FROM `{{PROJECT_ID}}.{{DATASET}}.mart_funnel_steps` LIMIT 1) THEN 1 ELSE 0 END AS funnel_coverage_present,
  CASE WHEN EXISTS (SELECT 1 FROM `{{PROJECT_ID}}.{{DATASET}}.mart_daily_execution_kpis` LIMIT 1) THEN 1 ELSE 0 END AS kpi_snapshot_present,
  CASE WHEN EXISTS (
    SELECT 1
    FROM `{{PROJECT_ID}}.{{DATASET}}.mart_daily_product_kpis`
    WHERE event_date >= DATE_SUB(CURRENT_DATE(), INTERVAL 7 DAY)
    LIMIT 1
  ) THEN 1 ELSE 0 END AS recent_data_present;
