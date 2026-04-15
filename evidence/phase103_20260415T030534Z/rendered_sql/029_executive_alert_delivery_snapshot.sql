SELECT
  CURRENT_DATE() AS snapshot_date,
  'ok' AS current_alert_state,
  'info' AS severity,
  'activity' AS impacted_kpi_family,
  1 AS delivery_readiness_marker
FROM `prj-maq-workcaptain-nonprod.workcaptain_analytics.mart_daily_product_kpis`
ORDER BY event_date DESC
LIMIT 1;
