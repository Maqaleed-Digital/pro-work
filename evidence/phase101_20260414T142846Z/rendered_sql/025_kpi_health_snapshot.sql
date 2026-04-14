SELECT
  CURRENT_DATE() AS snapshot_date,
  COUNT(*) AS trend_rows_available
FROM `prj-maq-workcaptain-nonprod.workcaptain_analytics.mart_daily_product_kpis`;
