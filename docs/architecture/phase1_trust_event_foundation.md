# ProWork Phase 1 — Trust Event Foundation

**Date:** 2026-03-06
**Status:** Delivered

## Purpose

Implements the canonical event backbone that underpins the locked Sprint rollout order:

| Sprint | Domain |
|--------|--------|
| A | WOS Core |
| B | Sovereign Recruiting |
| C | Sovereign Onboarding |
| D | Sovereign Hiring |
| E | Lifecycle + ESB + Offboarding |

No important business state transition happens without a domain event.

## Delivered Modules

| File | Role |
|------|------|
| `app/modules/event_bus/envelope.js` | Canonical envelope validation + canonicalization |
| `app/modules/event_bus/schema_registry.js` | 15 MVP event type contracts |
| `app/modules/event_bus/index.js` | Publisher factory + InMemoryEventStore |
| `app/modules/execution_engine/event_hooks.js` | Typed emit helpers for execution domain |
| `app/modules/trust_engine/ledger_hash.js` | Canonical payload digest + hash chaining |
| `app/modules/trust_engine/trust_consumer.js` | Trust-sensitive event ledger consumer |
| `app/storage/migrations/20260306_phase1_trust_event_foundation.sql` | Postgres schema + seed |

## Phase 1 Event Catalog (15 types)

### Execution Domain (non-trust-sensitive)
1. `PROJECT_CREATED` — aggregate: PROJECT
2. `WORKSTREAM_CREATED` — aggregate: WORKSTREAM
3. `MILESTONE_CREATED` — aggregate: MILESTONE
4. `EXECUTION_JOB_CREATED` — aggregate: EXECUTION_JOB
5. `EXECUTION_JOB_COMPLETED` — aggregate: EXECUTION_JOB
6. `DELIVERABLE_SUBMITTED` — aggregate: DELIVERABLE
7. `ESCROW_HOLD_CREATED` — aggregate: ESCROW
8. `ESCROW_RELEASED` — aggregate: ESCROW

### Trust Domain (trust-sensitive → ledger)
9. `DELIVERABLE_APPROVED` — aggregate: DELIVERABLE
10. `AGENT_JOB_COMPLETED` — aggregate: AGENT_JOB
11. `PHR_REVIEW_APPROVED` — aggregate: APPROVAL
12. `MILESTONE_COMPLETED` — aggregate: MILESTONE
13. `EVIDENCE_PACK_GENERATED` — aggregate: EVIDENCE_PACK
14. `TRUST_LEDGER_APPENDED` — aggregate: TRUST_EVENT
15. `TOKEN_ISSUED` — aggregate: TOKEN

## Envelope Contract

Every domain event must conform to:

```
{
  event_id:          UUID (required)
  event_type:        /^[A-Z0-9_]+$/ (required)
  event_version:     string (required)
  occurred_at:       ISO-8601 timestamp (required)
  tenant_id:         UUID (required)
  aggregate_type:    string (required)
  aggregate_id:      UUID (required)
  actor: {
    actor_type:      HUMAN | AGENT | SYSTEM
    actor_id:        string
  }
  correlation_id:    UUID (required)
  causation_id:      UUID (required)
  source: {
    service:         string
    module:          string
    environment:     string
  }
  trust_level:       LOW | STANDARD | HIGH | CRITICAL
  requires_approval: boolean
  payload:           object (type-specific required fields)
  metadata:          object
}
```

## Trust Ledger Chain

Trust-sensitive events produce a `trust_ledger_entries` row:

```
entry_hash = SHA256(event_id | event_type | aggregate_id | payload_digest | prev_hash)
payload_digest = SHA256(canonicalize(payload))
```

The chain is verified by walking `prev_hash` links from the most recent entry to genesis (`prev_hash = null`).

## Storage

| Table | Purpose |
|-------|---------|
| `domain_events` | Append-only canonical event store |
| `event_schema_registry` | Event type contracts + versioning |
| `trust_ledger_entries` | Derived hash-chained ledger (trust-sensitive only) |
| `trust_consumer_checkpoints` | At-least-once delivery tracking |

## Next Integration Target

Sprint A — WOS Core:
- Wire requisition/project bootstrap to `emitProjectCreated`
- Wire internal marketplace matching initiation to `emitWorkstreamCreated`
- Wire dashboard projection consumers to subscribe to `MILESTONE_COMPLETED`
