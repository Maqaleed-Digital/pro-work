SELECT
  table_name
FROM `{{PROJECT_ID}}.{{DATASET}}.INFORMATION_SCHEMA.VIEWS`
WHERE table_name IN (
  'mart_daily_product_kpis',
  'mart_daily_execution_kpis',
  'mart_daily_trust_kpis'
)
ORDER BY table_name;
