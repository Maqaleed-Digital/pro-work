# PROWORK — PHASE 15: TENANT-BOUND GOVERNANCE + JURISDICTIONAL ISOLATION LAYER

Version: 1.0
Status: ACTIVE
Phase: 15
Source of Truth Base: 0b3ea9dc2bd69d3cba48024c3c2e0cdc53420169

---

## Objective

Extend the Phase 14 policy-bound, approval-gated, audit-recorded runtime with
tenant-bound governance and jurisdictional isolation. Every governed privileged
operation must resolve valid tenant context and compatible jurisdiction context
before proceeding. Missing, inactive, or incompatible tenant/jurisdiction context
fails closed (403).

---

## Architecture

Phase 15 is **additive**. All Phase 10–14 controls remain intact:
- Phase 10: route-level RBAC
- Phase 11: permission-bound operational control
- Phase 12: append-only authorization audit
- Phase 13: approval-bound privileged operations
- Phase 14: sovereign control registry

Phase 15 adds the tenant/jurisdiction governance layer BEFORE the Phase 14 sovereign
registry check in the governed proof routes. The resolution chain is:

```
authenticate → permission check → tenant governance check → jurisdiction governance check
  → sovereign registry check → approval gate → execute
```

---

## New Module: app/lib/tenant_jurisdiction.js

### Jurisdiction Catalog

| Code   | Name                       | Status | Policy Version |
|--------|----------------------------|--------|----------------|
| KSA    | Kingdom of Saudi Arabia    | active | 1.0            |
| GCC    | Gulf Cooperation Council   | active | 1.0            |
| GLOBAL | Global (no restriction)    | active | 1.0            |

### Compatibility Matrix

| Request Jurisdiction | Compatible Tenant Jurisdictions |
|---------------------|--------------------------------|
| KSA                  | KSA, GLOBAL                   |
| GCC                  | KSA, GCC, GLOBAL              |
| GLOBAL               | KSA, GCC, GLOBAL (always)     |

Tenant with GLOBAL jurisdiction accepts any known request jurisdiction.

### Functions

| Function                        | Description                                           |
|---------------------------------|-------------------------------------------------------|
| resolveJurisdiction(code)       | Fail-closed: unknown/inactive → {ok:false}            |
| resolveTenantGovernance(tid, r) | Fail-closed: unknown/inactive tenant → {ok:false}     |
| validateCrossTenant(pTid, rTid) | Wildcard "*" passes; mismatch → {ok:false}            |
| validateJurisdictionCompatibility(req, tenant) | GLOBAL always passes; incompatible → {ok:false} |
| initTenantGovernance(tenantRegistry) | Populate from registry at startup (default: GLOBAL) |
| setTenantJurisdiction(tid, code, r) | In-memory admin/test mutation                    |
| getGovernanceState()            | Read-only snapshot array                              |
| exportGovernance(outputPath?)   | JSON artifact, no state mutation                      |

---

## New Server Routes

### Admin — superadmin (OPS_OVERRIDE permission) only

| Method | Route                                            | Name                              |
|--------|--------------------------------------------------|-----------------------------------|
| GET    | /api/admin/tenant-governance                     | tenant.governance.list            |
| GET    | /api/admin/tenant-governance/export              | tenant.governance.export          |
| GET    | /api/admin/tenant-governance/jurisdictions       | tenant.governance.jurisdictions   |
| POST   | /api/admin/tenant-governance/:tenantId/set-jurisdiction | tenant.governance.set_jurisdiction |

### Governed Proof Routes — tenant/jurisdiction-gated privileged validators

| Method | Route                            | Name                        | Required Headers                        |
|--------|----------------------------------|-----------------------------|-----------------------------------------|
| POST   | /api/ops/governed-override       | ops.governed_override       | X-Tenant-Id, X-Jurisdiction-Code        |
| POST   | /api/ops/governed-force-execute  | ops.governed_force_execute  | X-Tenant-Id, X-Jurisdiction-Code        |

Both proof routes require: authenticate → perm check → tenant check → jurisdiction check
→ sovereign registry check → approval gate → 202.

---

## Fail-Closed Rules

| Condition                      | HTTP Code | Error Code               |
|-------------------------------|-----------|--------------------------|
| Missing X-Tenant-Id           | 403       | TENANT_REQUIRED          |
| Unknown tenant                | 403       | TENANT_GOVERNANCE_DENIED |
| Inactive tenant               | 403       | TENANT_GOVERNANCE_DENIED |
| Cross-tenant mismatch         | 403       | TENANT_FORBIDDEN         |
| Missing X-Jurisdiction-Code   | 403       | JURISDICTION_REQUIRED    |
| Unknown jurisdiction          | 403       | JURISDICTION_DENIED      |
| Incompatible jurisdiction     | 403       | JURISDICTION_INCOMPATIBLE|

---

## Logging

All governed actions log `tenant_id` and `jurisdiction_code` at the resolution
decision event. Events:
- `tenant.governance.resolved`
- `tenant.governance.cross_tenant_denied`
- `tenant.governance.missing_tenant`
- `jurisdiction.governance.resolved`
- `jurisdiction.governance.incompatible`
- `governed.override.accepted`
- `governed.force_execute.accepted`
