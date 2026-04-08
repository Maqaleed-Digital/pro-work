# PROWORK — CONTROL ATTESTATION / COMPLIANCE REPORTING SCHEMA

Version: 1.0
Status: ACTIVE
Phase: 22

---

## Attestation Entry

| Field | Type | Description |
|-------|------|-------------|
| attestation_id | string | `att_<uuid>` — unique identifier |
| control_id | string | Unique control identifier (required) |
| control_family | string | Governance family (see CONTROL_FAMILIES) |
| attestation_status | enum | pass \| fail \| degraded \| unavailable |
| attestation_scope | string | Scope label; defaults to "global" |
| assurance_evidence_ref | string\|null | Reference to supporting evidence |
| attestation_policy_version | string | Policy version at attestation time |
| control_attestation_version | string | Schema version |
| attested_at | ISO8601 | When attestation was recorded |

---

## Compliance Report Entry

| Field | Type | Description |
|-------|------|-------------|
| report_id | string | `rpt_<uuid>` — unique identifier |
| report_type | enum | governance.control_report \| tenant.compliance_report \| jurisdiction.compliance_report \| incident.assurance_report |
| report_scope | string | Scope label; defaults to "global" |
| report_status | enum | pass \| fail \| degraded \| unavailable |
| tenant_id | string\|null | Tenant scope for tenant reports |
| jurisdiction_code | string\|null | Jurisdiction scope for jurisdiction reports |
| report_policy_version | string | Policy version at generation time |
| control_attestation_version | string | Schema version |
| generated_at | ISO8601 | When report was generated |
| attestation_count | number | Number of attestations included |
| attestations | Attestation[] | Snapshot of included attestations |

---

## Status Constants

```
ATTESTATION_STATUSES:
  PASS        = "pass"
  FAIL        = "fail"
  DEGRADED    = "degraded"
  UNAVAILABLE = "unavailable"

REPORT_TYPES:
  GOVERNANCE_CONTROL      = "governance.control_report"
  TENANT_COMPLIANCE       = "tenant.compliance_report"
  JURISDICTION_COMPLIANCE = "jurisdiction.compliance_report"
  INCIDENT_ASSURANCE      = "incident.assurance_report"

REPORT_STATUSES:
  PASS        = "pass"
  FAIL        = "fail"
  DEGRADED    = "degraded"
  UNAVAILABLE = "unavailable"
```

---

## Attestation State Snapshot

```json
{
  "attestation_count": 0,
  "control_attestation_version": "1.0",
  "attestations": [],
  "by_family": {}
}
```

## Report State Snapshot

```json
{
  "report_count": 0,
  "control_attestation_version": "1.0",
  "reports": []
}
```

## Export Artifacts

### Attestation Export
```json
{
  "exported_at": "<ISO8601>",
  "control_attestation_version": "1.0",
  "attestation_count": 0,
  "attestations": [],
  "by_family": {}
}
```

### Report Export
```json
{
  "exported_at": "<ISO8601>",
  "control_attestation_version": "1.0",
  "report_count": 0,
  "reports": []
}
```

---

## Critical Families (fail-closed gate for report generation)

- `rbac_control`
- `permission_control`

Both must have at least one recorded attestation before any report type can be generated.
