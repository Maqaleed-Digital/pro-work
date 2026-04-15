SELECT
  CURRENT_DATE() AS snapshot_date,
  (SELECT COUNT(*) FROM `{{PROJECT_ID}}.{{DATASET}}.mart_daily_product_kpis`) AS executive_summary_metrics,
  (SELECT COUNT(*) FROM `{{PROJECT_ID}}.{{DATASET}}.mart_funnel_steps`) AS funnel_snapshot,
  (SELECT COUNT(*) FROM `{{PROJECT_ID}}.{{DATASET}}.mart_daily_execution_kpis`) AS kpi_health_snapshot,
  (SELECT COUNT(*) FROM `{{PROJECT_ID}}.{{DATASET}}.mart_daily_trust_kpis`) AS trust_snapshot;
