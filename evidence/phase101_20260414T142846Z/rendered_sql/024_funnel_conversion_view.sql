SELECT
  event_date,
  step_name,
  sessions_count
FROM `prj-maq-workcaptain-nonprod.workcaptain_analytics.mart_funnel_steps`
ORDER BY event_date DESC, step_name ASC
LIMIT 100;
