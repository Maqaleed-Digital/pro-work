SELECT
  CURRENT_DATE() AS snapshot_date,
  p.event_date,
  p.daily_active_users,
  p.api_request_volume,
  CASE WHEN p.daily_active_users < 1 THEN 1 ELSE 0 END AS daily_active_users_breach,
  CASE WHEN p.api_request_volume < 1 THEN 1 ELSE 0 END AS api_request_volume_breach
FROM `prj-maq-workcaptain-nonprod.workcaptain_analytics.mart_daily_product_kpis` p
ORDER BY p.event_date DESC
LIMIT 30;
