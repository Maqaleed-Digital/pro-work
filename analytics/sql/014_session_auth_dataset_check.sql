SELECT
  schema_name
FROM `{{PROJECT_ID}}.region-us.INFORMATION_SCHEMA.SCHEMATA`
WHERE schema_name = '{{DATASET}}';
