SELECT
  CURRENT_DATE() AS snapshot_date,
  COUNT(*) AS trend_rows_available
FROM `{{PROJECT_ID}}.{{DATASET}}.mart_daily_product_kpis`;
