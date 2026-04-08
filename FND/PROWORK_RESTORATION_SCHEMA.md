# PROWORK — Restoration Registry Schema

Version: 1.0
Phase: 21

---

## Restoration Entry

| Field | Type | Description |
|-------|------|-------------|
| restoration_id | string | `rest_<uuid>` — unique identifier |
| restoration_status | enum | pending \| in_progress \| validated \| completed |
| restoration_scope | string | Scope label; defaults to "general" |
| restoration_approved_by | string | Required approver identity |
| restoration_phase | number | Phase counter; increments on applyRestorationPhase |
| incident_id | string\|null | Associated incident ID (optional) |
| assurance_status | enum | pending \| verified \| failed |
| assurance_checks | string[] | List of assurance check identifiers |
| assurance_evidence_ref | string\|null | Reference to assurance evidence artifact |
| restoration_governance_version | string | Schema version at creation time |
| created_at | ISO8601 | Creation timestamp |
| phase_applied_at | ISO8601\|null | When phase was applied |
| assurance_started_at | ISO8601\|null | When assurance was started |
| validated_at | ISO8601\|null | When assurance was verified (passed) |
| completed_at | ISO8601\|null | When restoration was completed |

---

## Governance State Snapshot

```json
{
  "restoration_count": 0,
  "active_restoration_count": 0,
  "restorations": []
}
```

## Export Artifact

```json
{
  "exported_at": "<ISO8601>",
  "restoration_governance_version": "1.0",
  "restoration_count": 0,
  "active_restoration_count": 0,
  "restorations": []
}
```

---

## Status Constants

```
RESTORATION_STATUSES:
  PENDING     = "pending"
  IN_PROGRESS = "in_progress"
  VALIDATED   = "validated"
  COMPLETED   = "completed"

ASSURANCE_STATUSES:
  PENDING  = "pending"
  VERIFIED = "verified"
  FAILED   = "failed"
```

---

## Cleared Statuses (for isRestorationValidated)

A restoration is considered validated (cleared for governed execution) when its status is `validated` or `completed`.
