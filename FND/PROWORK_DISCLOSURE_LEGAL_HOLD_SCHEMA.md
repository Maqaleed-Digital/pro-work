# PROWORK — DISCLOSURE + LEGAL HOLD GOVERNANCE SCHEMA

Version: 1.0
Status: ACTIVE
Phase: 17

---

## Disclosure Basis Entry Schema

| Field          | Type   | Description                                         |
|----------------|--------|-----------------------------------------------------|
| basis          | string | Dot-notation key (e.g. regulatory.request)          |
| name           | string | Human-readable name                                 |
| status         | string | active or inactive                                  |
| policy_version | string | Policy version (e.g. "1.0")                         |
| description    | string | Scope description                                   |

---

## Disclosure Scope Entry Schema

| Field       | Type   | Description                        |
|-------------|--------|------------------------------------|
| scope       | string | Scope key (e.g. audit_records)     |
| description | string | Human-readable description         |

---

## Scope Allowance Matrix

| Basis                  | Permitted Scopes                                   |
|------------------------|----------------------------------------------------|
| regulatory.request     | audit_records, approval_records, full_export       |
| customer.disclosure    | audit_records, approval_records                    |
| internal.audit.review  | audit_records                                      |

---

## Legal Hold Entry Schema

| Field                    | Type         | Description                                |
|--------------------------|--------------|--------------------------------------------|
| legal_hold_id            | string       | Unique ID (lh_<uuid>)                      |
| tenant_id                | string       | Tenant this hold applies to                |
| scope                    | string       | Disclosure scope (audit_records, etc.)     |
| note                     | string       | Optional human note                        |
| status                   | string       | active or released                         |
| legal_hold_policy_version| string       | Policy version at creation                 |
| created_at               | ISO 8601     | Creation timestamp                         |
| released_at              | ISO 8601|null| Release timestamp (null if still active)   |

---

## Export Artifact Schema (exportGovernance output)

```json
{
  "exported_at":                   "<ISO 8601>",
  "disclosure_governance_version": "1.0",
  "disclosure_basis_count":        3,
  "disclosure_scope_count":        3,
  "legal_hold_count":              0,
  "active_hold_count":             0,
  "disclosure_bases":              [ ... ],
  "disclosure_scopes":             [ ... ],
  "legal_holds":                   [ ... ]
}
```

---

## Governance Resolution Rules

| Input Condition                                  | Result                                        |
|--------------------------------------------------|-----------------------------------------------|
| basis recognized, status=active                  | ok: true                                      |
| basis not recognized                             | ok: false, reason: unknown_basis              |
| basis empty/null                                 | ok: false, reason: unknown_basis              |
| scope recognized, within basis allowance         | ok: true, reason: in_scope                    |
| scope not recognized                             | ok: false, reason: unknown_scope              |
| scope outside basis allowance                    | ok: false, reason: out_of_scope               |
| legal hold state recognized (none/active/released) | ok: true                                    |
| legal hold state not recognized                  | ok: false, reason: unknown_hold_state         |
| tenant has active hold, disposal attempted       | blocked, reason: active_legal_hold            |
| tenant has no active hold                        | disposal proceeds                             |
