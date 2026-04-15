SELECT
  CURRENT_DATE() AS snapshot_date,
  'growth_recommendation' AS recommendation_type,
  'Increase live traffic acquisition and repeat usage measurement across the last 7-day window.' AS recommendation_text,
  'high' AS priority_band,
  'Grounded in current active usage footprint and early KPI maturity.' AS rationale
UNION ALL
SELECT
  CURRENT_DATE(),
  'funnel_recommendation',
  'Expand event coverage for mid-funnel steps to improve conversion explainability.',
  'high',
  'Grounded in current funnel step availability and early runtime telemetry depth.'
UNION ALL
SELECT
  CURRENT_DATE(),
  'execution_recommendation',
  'Increase completion-linked operational events to strengthen execution observability.',
  'medium',
  'Grounded in current execution signal breadth.'
UNION ALL
SELECT
  CURRENT_DATE(),
  'trust_recommendation',
  'Increase evidence cadence tracking to improve trust-state interpretability.',
  'medium',
  'Grounded in current trust/evidence monitoring structure.';
