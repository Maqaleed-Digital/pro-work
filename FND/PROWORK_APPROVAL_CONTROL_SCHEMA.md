# PROWORK — APPROVAL CONTROL SCHEMA

Version: 1.0
Status: ACTIVE
Phase: 13

---

## Approval Request Record Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `approval_request_id` | string | yes | Unique ID (`apr_<uuid>`) |
| `timestamp` | ISO 8601 | yes | Creation timestamp |
| `correlation_id` | string | yes | Request correlation ID |
| `request_id` | string | yes | Request trace ID |
| `requester_actor_id` | string | yes | Principal ID of requester |
| `requester_role` | string | yes | Role of requester |
| `action_type` | string | yes | One of APPROVAL_ACTIONS constants |
| `target_route` | string | yes | Target route or operation |
| `reason` | string | yes | Human-readable justification |
| `status` | string | yes | Initial `pending` |
| `evidence_version` | string | yes | Schema version (`1.0`) |

## Approval Decision Record Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `approval_decision_id` | string | yes | Unique ID (`apd_<uuid>`) |
| `timestamp` | ISO 8601 | yes | Decision timestamp |
| `approval_request_id` | string | yes | Links to request record |
| `approver_actor_id` | string | yes | Principal ID of approver |
| `approver_role` | string | yes | Role of approver |
| `decision_outcome` | string | yes | See outcomes below |
| `decision_reason` | string | yes | Human-readable reason |
| `maker_checker_valid` | boolean\|null | yes | true/false for MC actions; null otherwise |
| `expires_at` | string\|null | yes | Expiry timestamp (null = no expiry) |
| `consumed_at` | string\|null | yes | Set when consumed |
| `revoked_at` | string\|null | yes | Set when revoked |
| `evidence_version` | string | yes | Schema version |

## Decision Outcomes

| Outcome | Meaning |
|---------|---------|
| `pending` | Request submitted, awaiting decision |
| `approved` | Approved by eligible approver |
| `denied` | Explicitly denied |
| `revoked` | Previously approved, now revoked |
| `consumed` | Approval used — replay blocked |
| `expired` | Time-based expiry (future) |

## Control Rules
- Approval records are append-only (JSONL)
- Consumed approvals cannot be replayed
- Maker-checker actions deny self-approval
- Requester cannot execute as approver for maker-checker actions
- Wrong approver role → FORBIDDEN
- Auditor cannot request any approval
