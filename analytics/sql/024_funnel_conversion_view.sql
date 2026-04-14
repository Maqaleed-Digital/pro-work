SELECT
  event_date,
  step_name,
  sessions_count
FROM `{{PROJECT_ID}}.{{DATASET}}.mart_funnel_steps`
ORDER BY event_date DESC, step_name ASC
LIMIT 100;
