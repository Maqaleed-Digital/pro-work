BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Canonical domain events store (append-only)
CREATE TABLE IF NOT EXISTS domain_events (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id          UUID        NOT NULL UNIQUE,
  event_type        TEXT        NOT NULL,
  event_version     TEXT        NOT NULL,
  occurred_at       TIMESTAMPTZ NOT NULL,
  tenant_id         UUID        NOT NULL,
  aggregate_type    TEXT        NOT NULL,
  aggregate_id      UUID        NOT NULL,
  actor             JSONB       NOT NULL,
  correlation_id    UUID        NOT NULL,
  causation_id      UUID        NOT NULL,
  source            JSONB       NOT NULL,
  trust_level       TEXT        NOT NULL CHECK (trust_level IN ('LOW','STANDARD','HIGH','CRITICAL')),
  requires_approval BOOLEAN     NOT NULL DEFAULT FALSE,
  payload           JSONB       NOT NULL,
  metadata          JSONB       NOT NULL DEFAULT '{}'::jsonb,
  payload_hash      TEXT        NOT NULL,
  envelope_hash     TEXT        NOT NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_domain_events_tenant_occurred_at
  ON domain_events (tenant_id, occurred_at DESC);

CREATE INDEX IF NOT EXISTS idx_domain_events_aggregate
  ON domain_events (aggregate_type, aggregate_id, occurred_at DESC);

CREATE INDEX IF NOT EXISTS idx_domain_events_event_type
  ON domain_events (event_type, occurred_at DESC);

-- Schema registry (source of truth for event contracts)
CREATE TABLE IF NOT EXISTS event_schema_registry (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type        TEXT        NOT NULL,
  event_version     TEXT        NOT NULL,
  aggregate_type    TEXT        NOT NULL,
  producer_service  TEXT        NOT NULL,
  consumer_services JSONB       NOT NULL DEFAULT '[]'::jsonb,
  trust_sensitive   BOOLEAN     NOT NULL DEFAULT FALSE,
  payload_schema    JSONB       NOT NULL,
  status            TEXT        NOT NULL DEFAULT 'ACTIVE',
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (event_type, event_version)
);

-- Append-only trust ledger with hash chaining
CREATE TABLE IF NOT EXISTS trust_ledger_entries (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  ledger_entry_id  UUID        NOT NULL UNIQUE,
  event_id         UUID        NOT NULL REFERENCES domain_events(event_id) ON DELETE CASCADE,
  tenant_id        UUID        NOT NULL,
  aggregate_type   TEXT        NOT NULL,
  aggregate_id     UUID        NOT NULL,
  action_type      TEXT        NOT NULL,
  trust_level      TEXT        NOT NULL CHECK (trust_level IN ('LOW','STANDARD','HIGH','CRITICAL')),
  payload_digest   TEXT        NOT NULL,
  prev_hash        TEXT,
  entry_hash       TEXT        NOT NULL UNIQUE,
  evidence_pack_id UUID,
  occurred_at      TIMESTAMPTZ NOT NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_trust_ledger_entries_tenant_created_at
  ON trust_ledger_entries (tenant_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_trust_ledger_entries_aggregate
  ON trust_ledger_entries (aggregate_type, aggregate_id, created_at DESC);

-- Consumer checkpoints (at-least-once delivery tracking)
CREATE TABLE IF NOT EXISTS trust_consumer_checkpoints (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  consumer_name TEXT        NOT NULL,
  event_id      UUID        NOT NULL,
  processed_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (consumer_name, event_id)
);

-- Seed schema registry with Phase 1 event contracts
INSERT INTO event_schema_registry
  (event_type, event_version, aggregate_type, producer_service, consumer_services, trust_sensitive, payload_schema, status)
VALUES
  ('PROJECT_CREATED',       '1.0', 'PROJECT',       'execution_engine',  '["trust_engine"]'::jsonb,                    FALSE, '{"type":"object","required":["project_id","owner_user_id","title","status"]}'::jsonb,                                                                                          'ACTIVE'),
  ('WORKSTREAM_CREATED',    '1.0', 'WORKSTREAM',    'execution_engine',  '["trust_engine"]'::jsonb,                    FALSE, '{"type":"object","required":["workstream_id","project_id","stream_name","created_by"]}'::jsonb,                                                                              'ACTIVE'),
  ('MILESTONE_CREATED',     '1.0', 'MILESTONE',     'execution_engine',  '["trust_engine"]'::jsonb,                    FALSE, '{"type":"object","required":["milestone_id","workstream_id","project_id","created_by"]}'::jsonb,                                                                             'ACTIVE'),
  ('EXECUTION_JOB_CREATED', '1.0', 'EXECUTION_JOB', 'execution_engine',  '["trust_engine"]'::jsonb,                    FALSE, '{"type":"object","required":["execution_job_id","project_id","milestone_id","job_type","status"]}'::jsonb,                                                                  'ACTIVE'),
  ('EXECUTION_JOB_COMPLETED','1.0','EXECUTION_JOB', 'execution_engine',  '["trust_engine"]'::jsonb,                    FALSE, '{"type":"object","required":["execution_job_id","project_id","milestone_id","job_type","status","artifact_count","requires_approval"]}'::jsonb,                              'ACTIVE'),
  ('DELIVERABLE_SUBMITTED', '1.0', 'DELIVERABLE',   'execution_engine',  '["trust_engine"]'::jsonb,                    FALSE, '{"type":"object","required":["deliverable_id","project_id","milestone_id","submitted_by","status"]}'::jsonb,                                                                'ACTIVE'),
  ('DELIVERABLE_APPROVED',  '1.0', 'DELIVERABLE',   'execution_engine',  '["trust_engine"]'::jsonb,                    TRUE,  '{"type":"object","required":["deliverable_id","project_id","milestone_id","approval_record_id","approved_by","status"]}'::jsonb,                                            'ACTIVE'),
  ('AGENT_JOB_COMPLETED',   '1.0', 'AGENT_JOB',     'ai_fabric',         '["trust_engine"]'::jsonb,                    TRUE,  '{"type":"object","required":["agent_job_id","agent_id","agent_version_id","project_id","task_id","status","step_count","artifact_count","policy_profile_id"]}'::jsonb,     'ACTIVE'),
  ('PHR_REVIEW_APPROVED',   '1.0', 'APPROVAL',      'trust_engine',      '["trust_engine","reputation_engine"]'::jsonb, TRUE,  '{"type":"object","required":["phr_review_id","deliverable_id","agent_job_id","reviewer_user_id","review_status","signed_hash","evidence_pack_id"]}'::jsonb,                'ACTIVE'),
  ('MILESTONE_COMPLETED',   '1.0', 'MILESTONE',     'execution_engine',  '["trust_engine","reputation_engine"]'::jsonb, TRUE,  '{"type":"object","required":["milestone_id","workstream_id","project_id","completed_by_actor_type","completed_by_actor_id","approval_record_id","evidence_pack_id"]}'::jsonb,'ACTIVE'),
  ('EVIDENCE_PACK_GENERATED','1.0','EVIDENCE_PACK', 'trust_engine',      '["trust_engine"]'::jsonb,                    TRUE,  '{"type":"object","required":["evidence_pack_id","related_event_id","artifact_uri","status"]}'::jsonb,                                                                      'ACTIVE'),
  ('TRUST_LEDGER_APPENDED', '1.0', 'TRUST_EVENT',   'trust_engine',      '["trust_engine"]'::jsonb,                    TRUE,  '{"type":"object","required":["ledger_entry_id","action_type","entry_hash","prev_hash","payload_digest","evidence_pack_id"]}'::jsonb,                                       'ACTIVE'),
  ('TOKEN_ISSUED',          '1.0', 'TOKEN',          'reputation_engine', '["trust_engine","reputation_engine"]'::jsonb, TRUE,  '{"type":"object","required":["token_id","owner_user_id","token_type","issuer_tenant_id","payload_hash","issued_at"]}'::jsonb,                                             'ACTIVE'),
  ('ESCROW_HOLD_CREATED',   '1.0', 'ESCROW',         'wallet_escrow',     '["trust_engine"]'::jsonb,                    FALSE, '{"type":"object","required":["escrow_id","project_id","amount","currency_code","created_by"]}'::jsonb,                                                                    'ACTIVE'),
  ('ESCROW_RELEASED',       '1.0', 'ESCROW',         'wallet_escrow',     '["trust_engine"]'::jsonb,                    FALSE, '{"type":"object","required":["escrow_id","project_id","released_amount","currency_code","released_by"]}'::jsonb,                                                          'ACTIVE')
ON CONFLICT (event_type, event_version) DO NOTHING;

COMMIT;
