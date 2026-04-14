CREATE OR REPLACE VIEW `{{PROJECT_ID}}.{{DATASET}}.mart_funnel_steps` AS
WITH step_events AS (
  SELECT
    DATE(occurred_at) AS event_date,
    session_id,
    event_name
  FROM `{{PROJECT_ID}}.{{DATASET}}.raw_frontend_events`
  WHERE event_name IN (
    'landing_view',
    'signup_started',
    'signup_completed',
    'login_success',
    'dashboard_view',
    'primary_action_completed'
  )
)
SELECT
  event_date,
  'core_activation_funnel' AS funnel_name,
  event_name AS step_name,
  COUNT(DISTINCT session_id) AS sessions_count
FROM step_events
GROUP BY event_date, funnel_name, step_name;
