-- S45-G2: Add persona_type to users table
-- Backfills existing users as EMPLOYER

BEGIN;

ALTER TABLE users ADD COLUMN IF NOT EXISTS persona_type VARCHAR(16) NOT NULL DEFAULT 'EMPLOYER'
  CHECK (persona_type IN ('EMPLOYER', 'SEEKER', 'BOTH'));

ALTER TABLE users ADD COLUMN IF NOT EXISTS current_persona_preference VARCHAR(16) DEFAULT 'EMPLOYER'
  CHECK (current_persona_preference IN ('EMPLOYER', 'SEEKER'));

CREATE INDEX IF NOT EXISTS idx_users_persona ON users(persona_type);

COMMIT;
