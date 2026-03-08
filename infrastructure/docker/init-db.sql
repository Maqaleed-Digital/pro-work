-- ProWork Database Initialization

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

GRANT ALL PRIVILEGES ON DATABASE prowork TO prowork;

INSERT INTO tenants (id, name, status, created_at)
VALUES ('default', 'Default Tenant', 'active', NOW())
ON CONFLICT (id) DO NOTHING;

DO $$
BEGIN
    IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'prowork_readonly') THEN
        CREATE ROLE prowork_readonly WITH LOGIN PASSWORD 'prowork_readonly_pass';
    END IF;
END
$$;

GRANT CONNECT ON DATABASE prowork TO prowork_readonly;
GRANT USAGE ON SCHEMA public TO prowork_readonly;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO prowork_readonly;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO prowork_readonly;
