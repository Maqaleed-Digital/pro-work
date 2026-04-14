SELECT
  table_name
FROM `{{PROJECT_ID}}.{{DATASET}}.INFORMATION_SCHEMA.TABLES`
WHERE table_name IN (
  'raw_frontend_events',
  'raw_platform_events'
)
ORDER BY table_name;
