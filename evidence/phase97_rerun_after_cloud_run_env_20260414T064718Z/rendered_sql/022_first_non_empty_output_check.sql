SELECT
  p.event_date,
  p.daily_active_users,
  p.session_count,
  p.api_request_volume,
  e.milestones_completed_count,
  t.evidence_packs_generated_count
FROM `prj-maq-workcaptain-nonprod.workcaptain_analytics.mart_daily_product_kpis` p
LEFT JOIN `prj-maq-workcaptain-nonprod.workcaptain_analytics.mart_daily_execution_kpis` e
  ON p.event_date = e.event_date
LEFT JOIN `prj-maq-workcaptain-nonprod.workcaptain_analytics.mart_daily_trust_kpis` t
  ON p.event_date = t.event_date
ORDER BY p.event_date DESC
LIMIT 10;
