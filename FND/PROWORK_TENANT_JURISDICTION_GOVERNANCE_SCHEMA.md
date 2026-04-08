# PROWORK — TENANT / JURISDICTION GOVERNANCE SCHEMA

Version: 1.0
Status: ACTIVE
Phase: 15

---

## Tenant Governance Entry Schema

| Field                     | Type   | Description                                              |
|---------------------------|--------|----------------------------------------------------------|
| tenant_id                 | string | Stable tenant identifier                                 |
| jurisdiction_code         | string | Assigned jurisdiction: KSA, GCC, or GLOBAL               |
| tenant_governance_version | string | Schema version (e.g. "1.0")                              |
| status                    | string | One of: active, disabled                                 |
| initialized_at            | string | ISO 8601 UTC timestamp when governance entry was created |

---

## Jurisdiction Entry Schema

| Field          | Type   | Description                              |
|----------------|--------|------------------------------------------|
| code           | string | Canonical code: KSA, GCC, GLOBAL         |
| name           | string | Human-readable name                      |
| status         | string | active or inactive                       |
| policy_version | string | Jurisdiction policy version (e.g. "1.0") |
| description    | string | Scope description                        |

---

## Jurisdiction Codes

| Code   | Scope                               | Compatible Request Jurisdictions |
|--------|-------------------------------------|----------------------------------|
| KSA    | Kingdom of Saudi Arabia only        | KSA, GLOBAL                      |
| GCC    | Gulf Cooperation Council regional   | KSA, GCC, GLOBAL                 |
| GLOBAL | Global / no restriction             | KSA, GCC, GLOBAL (all)           |

---

## Export Artifact Schema (exportGovernance output)

```json
{
  "exported_at":               "<ISO 8601>",
  "tenant_governance_version": "1.0",
  "tenant_count":              3,
  "jurisdiction_count":        3,
  "tenants":                   [ ... ],
  "jurisdictions":             [ ... ]
}
```

---

## Governance Resolution Rules

| Input Condition                              | Result                        |
|----------------------------------------------|-------------------------------|
| tenant_id in registry, status=active          | ok: true                      |
| tenant_id in registry, status=disabled        | ok: false, reason: inactive_tenant |
| tenant_id not in registry                     | ok: false, reason: unknown_tenant |
| tenant_id empty/null                          | ok: false, reason: missing_tenant |
| jurisdiction code recognized, status=active   | ok: true                      |
| jurisdiction code not recognized              | ok: false, reason: unknown_jurisdiction |
| principal.tenant_id = "*"                     | cross-tenant always passes    |
| principal.tenant_id != request tenant_id      | ok: false, reason: cross_tenant |
| request jurisdiction incompatible with tenant | ok: false, reason: incompatible_jurisdiction |
| GLOBAL request jurisdiction                   | always compatible             |
| GLOBAL tenant jurisdiction                    | accepts any known jurisdiction|
