SELECT
  'raw_frontend_events' AS table_name,
  COUNT(*) AS row_count
FROM `{{PROJECT_ID}}.{{DATASET}}.raw_frontend_events`
UNION ALL
SELECT
  'raw_platform_events' AS table_name,
  COUNT(*) AS row_count
FROM `{{PROJECT_ID}}.{{DATASET}}.raw_platform_events`;
