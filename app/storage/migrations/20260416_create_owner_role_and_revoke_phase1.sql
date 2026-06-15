-- Phase 1: run as postgres (cloudsqlsuperuser)
-- Creates prowork_owner role and grants membership to prowork_app

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT FROM pg_roles WHERE rolname = 'prowork_owner'
  ) THEN
    CREATE ROLE prowork_owner;
  END IF;
END $$;

GRANT prowork_owner TO prowork_app;
