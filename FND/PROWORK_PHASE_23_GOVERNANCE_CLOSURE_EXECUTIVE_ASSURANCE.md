# PROWORK / WORKCAPTAIN — PHASE 23
## Governance Closure + Executive Assurance Pack Layer

Version: 1.0
Status: ACTIVE
Phase: 23
Source of Truth Base: 8ca89eb8858ba358fc6f77c1afa2ca013ff99c8e

---

## Objective

Move the live attested and compliance-reporting runtime into formal governance closure and executive assurance packaging.

Phase 23 adds:
- governance closure model
- executive assurance pack model
- governed closure readiness evaluation
- deterministic closure artifact generation
- executive-ready assurance summary generation
- fail-closed closure gating for missing critical evidence
- tests proving closure and assurance pack behavior

---

## Closure Lifecycle

```
createClosure({ closureStatus, criticalEvidenceRefs, ... })
  → ready | blocked | incomplete | closed
```

- `ready` and `closed` require `criticalEvidenceRefs` (non-empty array) — fail closed if missing
- `blocked` and `incomplete` allow empty evidence refs

---

## Assurance Pack Lifecycle

```
createAssurancePack({ closureId, assuranceStatus, ... })
  → draft | validated | blocked | issued
```

- Requires a valid existing `closureId` — fail closed if missing or unknown
- `generateAssuranceSummary()` produces an executive cross-pack summary

---

## Governance Rules

1. Unknown `closure_status` → `unknown_closure_status`
2. Ready/closed without `criticalEvidenceRefs` → `missing_critical_evidence`
3. Missing `closure_id` for assurance pack → `missing_closure_id`
4. Unknown `closure_id` → `unknown_closure_id`
5. Unknown `assurance_status` → `unknown_assurance_status`
6. Blocked and incomplete states are visible in exports and summaries
7. Closure and assurance metadata must appear in logs and artifacts

---

## Control Family Coverage

| Family | Governance Layer |
|--------|-----------------|
| rbac_control | Phase 10 |
| permission_control | Phase 11 |
| audit_evidence_control | Phase 12 |
| approval_control | Phase 13 |
| sovereign_policy_control | Phase 14 |
| tenant_jurisdiction_control | Phase 15 |
| residency_retention_control | Phase 16 |
| disclosure_legal_hold_control | Phase 17 |
| external_review_control | Phase 18 |
| incident_containment_control | Phase 19 |
| continuity_dr_control | Phase 20 |
| restoration_assurance_control | Phase 21 |
| control_attestation_reporting_control | Phase 22 |

---

## API Routes

| Method | Route | Permission | Description |
|--------|-------|------------|-------------|
| GET | /api/admin/governance-closure | OPS_OVERRIDE | Get closure state snapshot |
| GET | /api/admin/governance-closure/export | OPS_OVERRIDE | Export closures artifact |
| POST | /api/admin/governance-closure/record | OPS_OVERRIDE | Record a governance closure |
| GET | /api/admin/governance-closure/tenant | OPS_OVERRIDE | Get closures for tenant (?tenant_id=) |
| GET | /api/admin/governance-closure/jurisdiction | OPS_OVERRIDE | Get closures for jurisdiction (?jurisdiction_code=) |
| GET | /api/admin/executive-assurance-pack | OPS_OVERRIDE | Get assurance pack state snapshot |
| GET | /api/admin/executive-assurance-pack/export | OPS_OVERRIDE | Export assurance packs artifact |
| POST | /api/admin/executive-assurance-pack/record | OPS_OVERRIDE | Record an executive assurance pack |
| GET | /api/admin/executive-assurance-pack/summary | OPS_OVERRIDE | Generate executive assurance summary |
