SELECT
  'raw_frontend_events' AS table_name,
  COUNT(*) AS row_count
FROM `prj-maq-workcaptain-nonprod.workcaptain_analytics.raw_frontend_events`
UNION ALL
SELECT
  'raw_platform_events' AS table_name,
  COUNT(*) AS row_count
FROM `prj-maq-workcaptain-nonprod.workcaptain_analytics.raw_platform_events`;
