# PROWORK — EXTERNAL REVIEW GATEWAY SCHEMA

Version: 1.0
Status: ACTIVE
Phase: 18

---

## Review Session Entry Schema

| Field                           | Type         | Description                                             |
|---------------------------------|--------------|---------------------------------------------------------|
| review_session_id               | string       | Unique ID (ers_<uuid>)                                  |
| reviewer_type                   | string       | regulator / third_party_auditor / customer_reviewer     |
| review_scope                    | string       | evidence.read / audit.read / disclosure.export.read     |
| review_status                   | string       | active / expired / revoked / consumed                   |
| tenant_id                       | string       | Tenant this session is bound to                         |
| jurisdiction_code               | string       | KSA / GCC / GLOBAL                                      |
| disclosure_basis                | string|null  | Disclosure basis (required for disclosure.export.read)  |
| expires_at                      | ISO 8601|null | Session expiry timestamp (null = no expiry)             |
| revoked_at                      | ISO 8601|null | Revocation timestamp (null if not revoked)              |
| consumed_at                     | ISO 8601|null | Consumption timestamp (null if not consumed)            |
| created_at                      | ISO 8601     | Session creation timestamp                              |
| evidence_version                | string       | Evidence governance version at creation                 |
| external_review_gateway_version | string       | Gateway version at creation                             |

---

## Reviewer Types

| Value               | Description                                |
|---------------------|--------------------------------------------|
| regulator           | Regulatory authority reviewer              |
| third_party_auditor | Independent third-party auditor            |
| customer_reviewer   | Customer reviewing their own governed data |

---

## Review Scopes (read-only only)

| Value                   | Description                                     |
|-------------------------|-------------------------------------------------|
| evidence.read           | Read governed evidence records                  |
| audit.read              | Read authorization audit records                |
| disclosure.export.read  | Read/export disclosure-bound governed evidence  |

---

## Review Status Values

| Value    | Meaning                                          |
|----------|--------------------------------------------------|
| active   | Session is valid and usable                      |
| expired  | Session has passed its expires_at timestamp      |
| revoked  | Session has been explicitly revoked by admin     |
| consumed | Session has been marked as consumed (one-time)   |

---

## Export Artifact Schema (exportGateway output)

```json
{
  "exported_at":                     "<ISO 8601>",
  "external_review_gateway_version": "1.0",
  "reviewer_type_count":             3,
  "review_scope_count":              3,
  "review_session_count":            0,
  "active_session_count":            0,
  "reviewer_types":                  ["regulator", "third_party_auditor", "customer_reviewer"],
  "review_scopes":                   ["evidence.read", "audit.read", "disclosure.export.read"],
  "review_sessions":                 []
}
```

---

## Governance Resolution Rules

| Input Condition                                     | Result                                             |
|-----------------------------------------------------|----------------------------------------------------|
| reviewer type recognized                            | ok: true                                           |
| reviewer type not recognized                        | ok: false, reason: unknown_reviewer_type           |
| session scope matches required scope                | ok: true                                           |
| session scope does not match required scope         | ok: false, reason: scope_mismatch                  |
| session tenant matches request tenant               | ok: true                                           |
| session tenant does not match request tenant        | ok: false, reason: cross_tenant                    |
| session tenant is wildcard (*)                      | ok: true (any tenant)                              |
| request jurisdiction compatible with session        | ok: true                                           |
| request jurisdiction incompatible with session      | ok: false, reason: incompatible_jurisdiction       |
| session is active, not expired/revoked/consumed     | ok: true                                           |
| session is expired                                  | ok: false, reason: session_expired                 |
| session is revoked                                  | ok: false, reason: session_revoked                 |
| session is consumed                                 | ok: false, reason: session_consumed                |
| session id missing or empty                         | ok: false, reason: missing_session_id              |
| session id unknown                                  | ok: false, reason: unknown_session                 |
