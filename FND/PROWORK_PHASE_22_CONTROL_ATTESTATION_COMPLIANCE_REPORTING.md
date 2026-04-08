# PROWORK / WORKCAPTAIN — PHASE 22
## Continuous Control Attestation + Compliance Reporting Layer

Version: 1.0
Status: ACTIVE
Phase: 22
Source of Truth Base: 5e41f182da4b65e04946bfd1edda1ed4b807450c

---

## Objective

Move the live restored, post-incident-assured runtime into continuous control attestation and governed compliance reporting.

Phase 22 adds:
- continuous control attestation model
- governed compliance reporting model
- control status snapshot generation
- deterministic attestation evaluation across prior governance layers
- machine-readable compliance report generation
- fail-closed reporting for missing critical control attestations
- tests proving attestation and reporting behavior

---

## Attestation Lifecycle

Each control attestation records the evaluated state of a governed control family at a point in time.

```
recordAttestation({ controlId, controlFamily, status, scope, evidenceRef })
  → pass | fail | degraded | unavailable
```

Attestations are append-only per `control_id`. `resolveAttestation(controlId)` returns the latest.

---

## Report Lifecycle

Reports are derived from current attestation state. Critical control families (rbac_control, permission_control) must have at least one recorded attestation before any report can be generated. Missing critical attestations → fail closed.

```
generateReport({ reportType, reportScope, tenantId?, jurisdictionCode? })
  → governance.control_report | tenant.compliance_report
    | jurisdiction.compliance_report | incident.assurance_report
```

---

## Governance Rules

1. Unknown attestation status → `unknown_attestation_status`
2. Missing control_id → `missing_control_id`
3. Unknown report type → `unknown_report_type`
4. Missing critical control attestation (rbac_control, permission_control) → `missing_critical_attestation`
5. Degraded and unavailable statuses are visible in report_status derivation
6. Attestation and report metadata must appear in logs and artifacts

---

## Report Status Derivation

| Attestations in scope | report_status |
|-----------------------|---------------|
| Any `fail`            | fail          |
| Any `unavailable`     | unavailable   |
| Any `degraded`        | degraded      |
| All `pass`            | pass          |
| None                  | unavailable   |

---

## Control Families

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

---

## API Routes

| Method | Route | Permission | Description |
|--------|-------|------------|-------------|
| GET | /api/admin/control-attestation | OPS_OVERRIDE | Get attestation state snapshot |
| GET | /api/admin/control-attestation/export | OPS_OVERRIDE | Export attestation artifact |
| POST | /api/admin/control-attestation/record | OPS_OVERRIDE | Record a control attestation |
| GET | /api/admin/compliance-report | OPS_OVERRIDE | Get report state snapshot |
| GET | /api/admin/compliance-report/export | OPS_OVERRIDE | Export reports artifact |
| POST | /api/admin/compliance-report/generate | OPS_OVERRIDE | Generate a compliance report |
