CREATE OR REPLACE VIEW `prj-maq-workcaptain-nonprod.workcaptain_analytics.mart_daily_product_kpis` AS
SELECT
  DATE(occurred_at) AS event_date,
  COUNT(DISTINCT CASE WHEN event_name IN ('page_view','dashboard_view','login_success') THEN COALESCE(actor_id, session_id) END) AS daily_active_users,
  COUNT(DISTINCT session_id) AS session_count,
  AVG(CAST(JSON_VALUE(metadata, '$.session_duration_seconds') AS FLOAT64)) AS avg_session_duration_seconds,
  SAFE_DIVIDE(
    COUNT(DISTINCT CASE WHEN event_name = 'landing_view' AND COALESCE(JSON_VALUE(metadata, '$.is_bounce'),'false') = 'true' THEN session_id END),
    NULLIF(COUNT(DISTINCT CASE WHEN event_name = 'landing_view' THEN session_id END), 0)
  ) AS bounce_rate,
  COUNTIF(event_name = 'api_request_received') AS api_request_volume
FROM `prj-maq-workcaptain-nonprod.workcaptain_analytics.raw_frontend_events`
GROUP BY event_date;
