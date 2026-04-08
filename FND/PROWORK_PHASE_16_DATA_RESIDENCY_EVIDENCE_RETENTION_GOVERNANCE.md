# PROWORK — PHASE 16: DATA RESIDENCY + EVIDENCE RETENTION GOVERNANCE LAYER

Version: 1.0
Status: ACTIVE
Phase: 16
Source of Truth Base: 6ff2b578fba62bb7a3a6176df148e5de7f67a4c2

---

## Objective

Extend the Phase 15 tenant/jurisdiction-aware runtime with data residency enforcement
and evidence retention policy governance. Every governed evidence write path must resolve
a valid residency region (compatible with the request's jurisdiction) and a valid
retention class before proceeding. Missing, inactive, or incompatible residency/retention
context fails closed (403).

---

## Architecture

Phase 16 is **additive**. All Phase 10–15 controls remain intact. Phase 16 adds the
residency/retention governance layer AFTER the Phase 15 tenant/jurisdiction checks in
the governed evidence write proof route:

```
authenticate → permission check
  → tenant check (P15) → jurisdiction check (P15)
  → residency check (P16) → retention check (P16)
  → execute (202)
```

---

## New Module: app/lib/evidence_governance.js

### Residency Region Catalog

| Region | Name                       | Status | Policy Version |
|--------|----------------------------|--------|----------------|
| KSA    | Kingdom of Saudi Arabia    | active | 1.0            |
| GCC    | Gulf Cooperation Council   | active | 1.0            |
| GLOBAL | Global (no restriction)    | active | 1.0            |

### Residency Compatibility Matrix

| Request Jurisdiction | Permitted Residency Regions     |
|---------------------|---------------------------------|
| KSA                 | KSA, GLOBAL                     |
| GCC                 | KSA, GCC, GLOBAL                |
| GLOBAL              | KSA, GCC, GLOBAL (all)          |

GLOBAL residency is always compatible with any jurisdiction.
GLOBAL jurisdiction accepts any known residency region.

### Retention Class Catalog

| Class                        | Retention Days | Status | Description            |
|------------------------------|---------------|--------|------------------------|
| audit.short_term             | 90            | active | Auth audit short-term  |
| audit.long_term              | 2555 (7y)     | active | Auth audit long-term   |
| approval.long_term           | 2555 (7y)     | active | Approval records       |
| sovereign.control.long_term  | -1 (indefinite) | active | Sovereign control    |

### Functions

| Function                               | Description                                            |
|----------------------------------------|--------------------------------------------------------|
| resolveResidency(region)               | Fail-closed: unknown/inactive → {ok:false}             |
| resolveRetention(retentionClass)       | Fail-closed: unknown/inactive → {ok:false}             |
| validateResidencyCompatibility(r, j)   | GLOBAL always passes; incompatible → {ok:false}        |
| setRetentionStatus(class, status)      | In-memory admin/test mutation (active/inactive)        |
| getGovernanceState()                   | Read-only snapshot {regions, retention_classes}        |
| exportGovernance(outputPath?)          | JSON artifact, no state mutation                       |

---

## New Server Routes

### Admin — superadmin (OPS_OVERRIDE permission) only

| Method | Route                                                          | Name                                    |
|--------|----------------------------------------------------------------|-----------------------------------------|
| GET    | /api/admin/evidence-governance                                 | evidence.governance.list                |
| GET    | /api/admin/evidence-governance/export                          | evidence.governance.export              |
| GET    | /api/admin/evidence-governance/residency                       | evidence.governance.residency           |
| GET    | /api/admin/evidence-governance/retention                       | evidence.governance.retention           |
| POST   | /api/admin/evidence-governance/retention/:class/disable        | evidence.governance.retention.disable   |
| POST   | /api/admin/evidence-governance/retention/:class/enable         | evidence.governance.retention.enable    |

### Governed Evidence Write Proof Route

| Method | Route                          | Required Headers                                                          |
|--------|--------------------------------|---------------------------------------------------------------------------|
| POST   | /api/ops/governed-evidence-write | X-Tenant-Id, X-Jurisdiction-Code, X-Residency-Region, X-Retention-Class |

---

## Fail-Closed Rules

| Condition                         | HTTP Code | Error Code               |
|----------------------------------|-----------|--------------------------|
| Missing X-Residency-Region        | 403       | RESIDENCY_REQUIRED       |
| Unknown residency region          | 403       | RESIDENCY_DENIED         |
| Incompatible residency/jurisdiction | 403     | RESIDENCY_INCOMPATIBLE   |
| Missing X-Retention-Class         | 403       | RETENTION_REQUIRED       |
| Unknown retention class           | 403       | RETENTION_DENIED         |
| Inactive retention class          | 403       | RETENTION_DENIED         |

---

## Logging

All governed evidence write actions log `residency_region` and `retention_class` at the
resolution decision event. Events:
- `residency.governance.resolved`
- `residency.governance.incompatible`
- `residency.governance.missing`
- `retention.governance.resolved`
- `retention.governance.missing`
- `governed.evidence.write.accepted`
