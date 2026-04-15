SELECT
  CURRENT_DATE() AS snapshot_date,
  CASE
    WHEN MAX(daily_active_users) >= 1 AND MAX(api_request_volume) >= 1 THEN 0.10
    ELSE 0.75
  END AS anomaly_signal_score,
  CASE
    WHEN MAX(daily_active_users) >= 1 AND MAX(api_request_volume) >= 1 THEN 'stable'
    WHEN MAX(daily_active_users) >= 1 OR MAX(api_request_volume) >= 1 THEN 'watch'
    ELSE 'elevated'
  END AS anomaly_signal_band
FROM `prj-maq-workcaptain-nonprod.workcaptain_analytics.mart_daily_product_kpis`;
