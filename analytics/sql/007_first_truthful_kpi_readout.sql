SELECT
  event_date,
  daily_active_users
FROM `{{PROJECT_ID}}.{{DATASET}}.mart_daily_product_kpis`
ORDER BY event_date DESC
LIMIT 1;
