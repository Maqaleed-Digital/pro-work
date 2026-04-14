SELECT
  CURRENT_DATE() AS snapshot_date,
  CASE WHEN COALESCE(MAX(daily_active_users), 0) < 1 THEN 'traffic_drop' ELSE 'ok' END AS daily_active_users_alert,
  CASE WHEN COALESCE(MAX(api_request_volume), 0) < 1 THEN 'kpi_inactivity' ELSE 'ok' END AS api_request_volume_alert,
  CASE WHEN COALESCE(MAX(evidence_packs_generated_count), 0) < 0 THEN 'trust_execution_inactivity' ELSE 'ok' END AS evidence_alert
FROM (
  SELECT
    p.event_date,
    p.daily_active_users,
    p.api_request_volume,
    COALESCE(t.evidence_packs_generated_count, 0) AS evidence_packs_generated_count
  FROM `prj-maq-workcaptain-nonprod.workcaptain_analytics.mart_daily_product_kpis` p
  LEFT JOIN `prj-maq-workcaptain-nonprod.workcaptain_analytics.mart_daily_trust_kpis` t
    ON p.event_date = t.event_date
);
